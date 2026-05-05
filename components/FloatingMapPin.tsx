'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

// 우측 하단 c 버튼 — 컨텍스트별로 지도/피드 토글.
// 지도화면(/?view=map | /?apt= 등) → 피드 아이콘 + / 로 이동
// 그 외 → 지도핀 아이콘 + /?view=map 로 이동
export default function FloatingMapPin() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const isMap = pathname === '/' && (
    sp.get('view') === 'map' || !!sp.get('apt') || !!sp.get('emart') || !!sp.get('factory')
  );

  return (
    <Link
      href={isMap ? '/' : '/?view=map'}
      aria-label={isMap ? '피드로' : '지도로'}
      className="fixed bottom-5 right-5 z-50 w-9 h-9 rounded-full bg-white/70 backdrop-blur-sm border border-border text-navy hover:bg-white hover:border-navy shadow-[0_2px_8px_rgba(0,0,0,0.08)] flex items-center justify-center no-underline"
    >
      {isMap ? (
        // 집(홈=피드) 아이콘 — 외곽 + 문 모두 stroke 로 그림
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ) : (
        // 지도핀
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      )}
    </Link>
  );
}
