import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 토큰 갱신 — Supabase 부하 시 미들웨어 25초 timeout 으로 사이트 전체가 504 가 되는 사고 방어
  // (2026-05-06). 5초 안에 못 받으면 그냥 통과 (서버 컴포넌트가 자체 fallback).
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
  await Promise.race([supabase.auth.getUser().catch(() => null), timeout]);

  // /community/[id] — community 카테고리가 아닌 글은 전용 게시판으로 307 redirect.
  // ⚠ 페이지 컴포넌트나 generateMetadata 에서 redirect() 하면 force-dynamic 스트리밍 탓에
  //   <meta http-equiv="refresh"> (200 HTML) 로 폴백됨 → 1초 지연·부분 렌더. 미들웨어는
  //   렌더링 전 단계라 정상 HTTP 307 이 나감. 익명 글(worry/love)이 커뮤니티 상세로 열려
  //   작성자·댓글 실명이 노출되던 사고의 정식 차단 지점.
  const communityMatch = request.nextUrl.pathname.match(/^\/community\/(\d+)$/);
  if (communityMatch) {
    const postId = communityMatch[1];
    const catBase: Record<string, string> = {
      hotdeal: '/hotdeal', stocks: '/stocks', realty: '/realty',
      worry: '/worry', coin: '/coin', love: '/love', blog: '/blog',
    };
    try {
      const lookup = supabase.from('posts').select('category').eq('id', postId).maybeSingle();
      const lookupTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      const result = await Promise.race([lookup, lookupTimeout]);
      const category = result && 'data' in result ? (result.data as { category?: string } | null)?.category : null;
      if (category && catBase[category]) {
        const url = request.nextUrl.clone();
        url.pathname = `${catBase[category]}/${postId}`;
        return NextResponse.redirect(url, 307);
      }
    } catch {
      // 조회 실패 시 그냥 통과 — /community/[id] 의 자체 redirect (meta-refresh) 가 fallback.
    }
  }

  // ?embed=1 → x-embed 헤더 set. Layout 이 headers() 로 읽어 minimal 모드로 분기.
  // (데스크톱 글 패널 drawer iframe 의 SSR 비용 절감용 — Sidebar/MobileTopBar/플로팅 위젯 skip)
  if (request.nextUrl.searchParams.get('embed') === '1') {
    response.headers.set('x-embed', '1');
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 자원 + 세션 갱신 불필요한 경로 제외
    // - /api/cron/* : Vercel Cron 호출, 사용자 세션 없음
    // - /api/payments/confirm : Toss 결제 confirm 콜백, 사용자 세션 없음
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|api/cron|api/payments/confirm|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)',
  ],
};
