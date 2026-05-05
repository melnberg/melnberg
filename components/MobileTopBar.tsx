'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// 모든 모바일 화면 상단 공통 멜른버그 타이틀 바 (sticky, 52px, lg 미만).
// 동작:
//   - 다른 페이지 → '/' 로 router.push
//   - 홈 + 지도 모드 → pushState 로 '/' 만들고 popstate 디스패치 (HomeMobileSwitcher 가 받아 클라 전환, 서버 RTT 0)
//   - 홈 + 피드 모드 → router.refresh()
//
// 주의: useSearchParams/usePathname 대신 window.location 직접 읽음.
// 이유: Next.js 15 의 useSearchParams 는 Suspense boundary 미지정 시 SSR 콘텍스트에서
// 통째로 deopt 되거나 hydration 이슈가 났던 사례 회피.
function readState(): { isHome: boolean; isHomeMap: boolean } {
  if (typeof window === 'undefined') return { isHome: false, isHomeMap: false };
  const path = window.location.pathname;
  const sp = new URLSearchParams(window.location.search);
  const isHome = path === '/';
  const isHomeMap = isHome && (sp.get('view') === 'map' || sp.has('apt') || sp.has('emart') || sp.has('factory'));
  return { isHome, isHomeMap };
}

export default function MobileTopBar() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // hydration 안전성을 위해 initial state 는 양쪽 false. mount 후 popstate 와 동일 로직으로 동기화.
  const [{ isHome, isHomeMap }, setState] = useState({ isHome: false, isHomeMap: false });

  useEffect(() => {
    const sync = () => setState(readState());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    if (!isHome) {
      router.push('/');
      return;
    }
    if (isHomeMap) {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      startTransition(() => router.refresh());
    }
  }

  return (
    <a
      href="/"
      onClick={onClick}
      aria-label="홈으로"
      // display:flex 명시 + flex-shrink-0 으로 레이아웃 안전. block 도 display:flex 가 덮어써서 OK.
      style={{ display: 'flex' }}
      className="lg:hidden sticky top-0 z-30 h-[52px] w-full bg-white/85 backdrop-blur-sm border-b border-border items-center justify-center gap-2 no-underline flex-shrink-0"
    >
      <img src="/logo.svg" alt="" className="w-7 h-7 flex-shrink-0" />
      <span className="text-[17px] font-bold text-navy tracking-tight">멜른버그</span>
    </a>
  );
}
