'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

// 모든 모바일 화면 상단에 항상 노출되는 멜른버그 타이틀 바 (sticky, 52px).
// 동작:
//   - 다른 페이지 → '/' 로 navigate
//   - 홈 (지도 모드: ?view=map / ?apt= / ?emart= / ?factory=) → 같은 클라이언트 전환 (서버 RTT 0).
//     useSearchParams 로 직접 검사 + history.pushState 후 popstate 디스패치 → HomeMobileSwitcher 가 받아 뷰 전환.
//   - 홈 (피드 모드) → router.refresh() 로 서버 컴포넌트 다시 가져옴
export default function MobileTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    if (pathname !== '/') {
      router.push('/');
      return;
    }
    // 홈 안에서: 지도 모드면 피드로 전환 (클라이언트 only), 피드 모드면 새로고침
    const isMap = sp.get('view') === 'map' || sp.has('apt') || sp.has('emart') || sp.has('factory');
    if (isMap) {
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
      className="lg:hidden sticky top-0 z-30 h-[52px] bg-white/85 backdrop-blur-sm border-b border-border flex items-center justify-center gap-2 no-underline flex-shrink-0"
    >
      <img src="/logo.svg" alt="" className="w-7 h-7 flex-shrink-0" />
      <span className="text-[17px] font-bold text-navy tracking-tight">멜른버그</span>
    </a>
  );
}
