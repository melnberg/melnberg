import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { normalizePhone, smsConfig } from '@/lib/sms/sender';

// 이메일 가입 — 폰 인증 검증 후 admin 으로 사용자 생성.
// 클라이언트가 직접 supabase.auth.signUp 우회 못 하도록 이 endpoint 강제.

type Body = {
  email?: string;
  password?: string;
  phone?: string;
  verification_id?: string;
  display_name?: string;
  naver_id?: string | null;
  link_url?: string | null;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const phone = normalizePhone(body.phone ?? '');
  const verificationId = body.verification_id;
  const displayName = (body.display_name ?? '').trim();

  if (!email.includes('@')) return NextResponse.json({ ok: false, error: '이메일이 유효하지 않습니다.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ ok: false, error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: '폰번호 형식이 올바르지 않습니다.' }, { status: 400 });
  if (!verificationId) return NextResponse.json({ ok: false, error: '폰 인증을 먼저 완료해주세요.' }, { status: 400 });
  if (!displayName) return NextResponse.json({ ok: false, error: '닉네임을 입력해주세요.' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: '서버 설정 누락' }, { status: 500 });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cfg = smsConfig();

  // 1) 폰 인증 검증 — 이 verification_id 가 verified 상태이고 동일 폰이고 미사용이고 최근일 것
  const { data: vrow, error: vErr } = await admin
    .from('phone_verifications')
    .select('id, phone, verified_at, consumed_at')
    .eq('id', verificationId)
    .maybeSingle();
  if (vErr) return NextResponse.json({ ok: false, error: vErr.message }, { status: 500 });
  if (!vrow) return NextResponse.json({ ok: false, error: '인증 정보가 없습니다. 다시 인증해주세요.' }, { status: 400 });
  if (vrow.phone !== phone) return NextResponse.json({ ok: false, error: '인증한 폰번호와 다릅니다.' }, { status: 400 });
  if (!vrow.verified_at) return NextResponse.json({ ok: false, error: '폰 인증이 완료되지 않았습니다.' }, { status: 400 });
  if (vrow.consumed_at) return NextResponse.json({ ok: false, error: '이미 사용된 인증입니다. 다시 인증해주세요.' }, { status: 400 });
  if (Date.now() - new Date(vrow.verified_at).getTime() > cfg.verificationValidMin * 60 * 1000) {
    return NextResponse.json({ ok: false, error: '인증 유효 시간이 지났습니다. 다시 인증해주세요.' }, { status: 400 });
  }

  // 2) 이메일 / 폰 / 닉네임 / 네이버ID 중복 검사
  {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (data?.users?.some((u) => u.email?.toLowerCase() === email)) {
      return NextResponse.json({ ok: false, error: '이미 가입된 이메일입니다.' }, { status: 409 });
    }
  }
  {
    const { data } = await admin.from('profiles').select('id').eq('phone', phone).limit(1);
    if (data && data.length > 0) {
      return NextResponse.json({ ok: false, error: '이미 가입된 휴대폰 번호입니다.' }, { status: 409 });
    }
  }
  {
    const { data } = await admin.from('profiles').select('id').eq('display_name', displayName).limit(1);
    if (data && data.length > 0) {
      return NextResponse.json({ ok: false, error: `이미 사용 중인 닉네임입니다: "${displayName}"` }, { status: 409 });
    }
  }
  if (body.naver_id) {
    const { data } = await admin.from('profiles').select('id').eq('naver_id', body.naver_id).limit(1);
    if (data && data.length > 0) {
      return NextResponse.json({ ok: false, error: `이미 가입된 네이버 ID입니다: "${body.naver_id}"` }, { status: 409 });
    }
  }

  // 3) 사용자 생성 — handle_new_user 트리거가 mlbg_signup 마커 보고 profile_completed 처리
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 폰 인증 받았으니 이메일 인증 생략
    user_metadata: {
      display_name: displayName,
      naver_id: body.naver_id ?? null,
      link_url: body.link_url ?? null,
      phone,
      mlbg_signup: true,
    },
  });
  if (createErr || !created.user) {
    return NextResponse.json({ ok: false, error: createErr?.message ?? '가입 실패' }, { status: 500 });
  }

  // 4) profiles 에 phone 기록 (handle_new_user 트리거가 phone 까지 못 채울 수 있어 명시 update)
  await admin.from('profiles').update({ phone }).eq('id', created.user.id);

  // 5) verification consumed
  await admin.from('phone_verifications').update({ consumed_at: new Date().toISOString() }).eq('id', verificationId);

  return NextResponse.json({ ok: true });
}
