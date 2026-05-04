import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// 네이버 OAuth 콜백:
// 1) state 검증
// 2) code → access_token 교환
// 3) /v1/nid/me 로 프로필 조회
// 4) Supabase admin 으로 사용자 생성/조회
// 5) magic link 생성 → 그 URL 로 redirect (Supabase 가 세션 쿠키 설정 후 우리 사이트로 돌려보냄)

type NaverProfile = {
  id: string;
  email?: string;
  name?: string;
  nickname?: string;
  mobile?: string;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const origin = url.origin;

  if (error || !code || !state) {
    return NextResponse.redirect(`${origin}/login?error=naver_${error ?? 'no_code'}`);
  }

  const c = await cookies();
  const cookieState = c.get('naver_oauth_state')?.value;
  const next = c.get('naver_oauth_next')?.value ?? '/';
  c.delete('naver_oauth_state');
  c.delete('naver_oauth_next');

  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(`${origin}/login?error=naver_state_mismatch`);
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clientId || !clientSecret || !supabaseUrl || !serviceKey) {
    return NextResponse.redirect(`${origin}/login?error=naver_misconfig`);
  }

  // 1) code → access_token
  const tokenRes = await fetch(
    `https://nid.naver.com/oauth2.0/token` +
      `?grant_type=authorization_code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&client_secret=${encodeURIComponent(clientSecret)}` +
      `&code=${encodeURIComponent(code)}` +
      `&state=${encodeURIComponent(state)}`,
    { method: 'GET', cache: 'no-store' },
  );
  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=naver_token_exchange`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    return NextResponse.redirect(`${origin}/login?error=naver_no_token`);
  }

  // 2) profile
  const meRes = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!meRes.ok) {
    return NextResponse.redirect(`${origin}/login?error=naver_profile_fetch`);
  }
  const meJson = (await meRes.json()) as { resultcode?: string; response?: NaverProfile };
  const profile = meJson.response;
  if (!profile?.email) {
    // 이메일 동의 안 받았으면 가입 불가 (Supabase user 식별이 이메일 기반)
    return NextResponse.redirect(`${origin}/login?error=naver_no_email`);
  }

  // 3) Supabase admin 으로 사용자 생성/조회
  const admin = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 기존 사용자 조회 (이메일 기준). admin.listUsers 는 페이지네이션 — 첫 페이지에서 찾는 단순 구현.
  // 실 사용자수 적을 때 OK. 많아지면 별도 RPC 로 교체 권장.
  let userId: string | null = null;
  {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = data?.users?.find((u) => u.email?.toLowerCase() === profile.email!.toLowerCase());
    userId = found?.id ?? null;
  }

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: profile.email,
      email_confirm: true,
      user_metadata: {
        provider: 'naver',
        naver_id: profile.id,
        display_name: profile.nickname ?? profile.name ?? '',
        phone: profile.mobile ?? '',
        // handle_new_user 트리거가 이 마커 보고 profile_completed_at 처리
        mlbg_signup: true,
      },
    });
    if (createErr || !created.user) {
      return NextResponse.redirect(`${origin}/login?error=naver_create_${encodeURIComponent(createErr?.message ?? 'unknown')}`);
    }
    userId = created.user.id;
  }

  // 4) magic link 생성 → action_link 로 redirect → Supabase 가 세션 쿠키 설정 후 redirect_to 로 돌려보냄
  // /auth/callback 이 미완료 프로필이면 /complete-signup 으로 우회시킴
  const callbackNext = `/auth/callback?next=${encodeURIComponent(next)}`;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: profile.email,
    options: { redirectTo: `${origin}${callbackNext}` },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.redirect(`${origin}/login?error=naver_link_${encodeURIComponent(linkErr?.message ?? 'unknown')}`);
  }

  return NextResponse.redirect(linkData.properties.action_link);
}
