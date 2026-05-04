import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { sendSms, normalizePhone, generateCode, hashCode, smsConfig } from '@/lib/sms/sender';

// POST { phone } → SMS 코드 발송. salt 는 row 의 id 로 사용 (별도 컬럼 X — 단순화).
export async function POST(request: NextRequest) {
  const { phone } = (await request.json().catch(() => ({}))) as { phone?: string };
  const normalized = normalizePhone(phone ?? '');
  if (!normalized) {
    return NextResponse.json({ ok: false, error: '폰번호 형식이 올바르지 않습니다 (010xxxxxxxx).' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: '서버 설정 누락' }, { status: 500 });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cfg = smsConfig();

  // 같은 폰번호 가입 여부 검사 — 이미 가입돼있으면 발송 거부
  {
    const { data } = await admin.from('profiles').select('id').eq('phone', normalized).limit(1);
    if (data && data.length > 0) {
      return NextResponse.json({ ok: false, error: '이미 가입된 휴대폰 번호입니다. 로그인해주세요.' }, { status: 409 });
    }
  }

  // rate limit — 시간당 발송 횟수 검사
  {
    const { data, error } = await admin.rpc('recent_phone_send_count', { p_phone: normalized });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (typeof data === 'number' && data >= cfg.hourlyLimitPerPhone) {
      return NextResponse.json({ ok: false, error: `시간당 ${cfg.hourlyLimitPerPhone}회까지만 발송 가능합니다. 잠시 후 다시 시도해주세요.` }, { status: 429 });
    }
  }

  const code = generateCode();
  const id = crypto.randomUUID();
  const codeHash = hashCode(id, code);
  const expiresAt = new Date(Date.now() + cfg.codeTtlMin * 60 * 1000).toISOString();

  const { error: insertErr } = await admin.from('phone_verifications').insert({
    id, phone: normalized, code_hash: codeHash, expires_at: expiresAt,
  });
  if (insertErr) {
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
  }

  const sms = await sendSms({
    to: normalized,
    text: `[멜른버그] 인증번호 ${code} (${cfg.codeTtlMin}분 내 입력)`,
  });
  if (!sms.ok) {
    return NextResponse.json({ ok: false, error: 'SMS 발송 실패: ' + sms.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, verification_id: id, ttl_min: cfg.codeTtlMin });
}
