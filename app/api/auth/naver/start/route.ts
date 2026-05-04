import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

// 네이버 로그인 시작 — authorize URL 로 redirect.
// state(CSRF) 와 next(로그인 후 이동 경로) 를 단기 쿠키에 저장.
export async function GET(request: NextRequest) {
  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL('/login?error=naver_misconfig', request.url));
  }

  const next = new URL(request.url).searchParams.get('next') ?? '/';
  const state = crypto.randomUUID().replace(/-/g, '');
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/naver/callback`;

  const authorizeUrl =
    `https://nid.naver.com/oauth2.0/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  const c = await cookies();
  // 5분 단기 쿠키 (콜백에서 검증 후 삭제)
  c.set('naver_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300,
  });
  c.set('naver_oauth_next', next, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 300,
  });

  return NextResponse.redirect(authorizeUrl);
}
