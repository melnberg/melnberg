import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { hashCode, normalizePhone, smsConfig } from '@/lib/sms/sender';

// POST { verification_id, code } → 검증. 성공 시 verified_at 기록.
// signup 시 이 verification_id 와 동일한 phone 을 함께 보내면 가입 진행.
export async function POST(request: NextRequest) {
  const { verification_id, code, phone } =
    (await request.json().catch(() => ({}))) as { verification_id?: string; code?: string; phone?: string };

  if (!verification_id || !code) {
    return NextResponse.json({ ok: false, error: '인증번호를 입력해주세요.' }, { status: 400 });
  }
  const normalized = normalizePhone(phone ?? '');
  if (!normalized) {
    return NextResponse.json({ ok: false, error: '폰번호가 유효하지 않습니다.' }, { status: 400 });
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

  const { data: row, error } = await admin
    .from('phone_verifications')
    .select('id, phone, code_hash, expires_at, verified_at, attempts')
    .eq('id', verification_id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ ok: false, error: '인증 요청을 찾을 수 없습니다. 다시 발송해주세요.' }, { status: 404 });
  if (row.phone !== normalized) {
    return NextResponse.json({ ok: false, error: '폰번호가 일치하지 않습니다.' }, { status: 400 });
  }
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: '인증번호가 만료되었습니다. 다시 발송해주세요.' }, { status: 400 });
  }
  if (row.attempts >= cfg.maxAttempts) {
    return NextResponse.json({ ok: false, error: '시도 횟수 초과. 새 인증번호를 발송해주세요.' }, { status: 429 });
  }
  if (row.verified_at) {
    // 이미 성공한 적 있음 → 그냥 성공 반환 (idempotent)
    return NextResponse.json({ ok: true });
  }

  const expectedHash = hashCode(verification_id, code.trim());
  if (expectedHash !== row.code_hash) {
    await admin.from('phone_verifications').update({ attempts: row.attempts + 1 }).eq('id', verification_id);
    return NextResponse.json({ ok: false, error: `인증번호가 일치하지 않습니다 (${row.attempts + 1}/${cfg.maxAttempts}).` }, { status: 400 });
  }

  await admin.from('phone_verifications').update({ verified_at: new Date().toISOString() }).eq('id', verification_id);
  return NextResponse.json({ ok: true });
}
