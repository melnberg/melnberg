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
      className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-navy text-white shadow-[0_4px_16px_rgba(0,32,96,0.4)] hover:bg-navy-dark flex items-center justify-center no-underline"
    >
      {isMap ? (
        // 피드 아이콘 (목록)
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      ) : (
        // 지도핀
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      )}
    </Link>
  );
}
