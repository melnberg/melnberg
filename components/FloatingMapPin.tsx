'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

// 우측 하단 토글 — 컨텍스트별로 지도/피드 전환.
// - 홈(/) 안에서: pushState 로 URL 만 갱신 + popstate 디스패치 → HomeMobileSwitcher 가 받아 클라이언트 전환 (서버 RTT 0)
// - 다른 페이지: router.push('/?view=map') 로 정상 navigate
function urlIsMap(): boolean {
  if (typeof window === 'undefined') return false;
  const sp = new URLSearchParams(window.location.search);
  return window.location.pathname === '/' && (
    sp.get('view') === 'map' || sp.has('apt') || sp.has('emart') || sp.has('factory')
  );
}

export default function FloatingMapPin() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const initialIsMap = pathname === '/' && (
    sp.get('view') === 'map' || !!sp.get('apt') || !!sp.get('emart') || !!sp.get('factory')
  );
  const [isMap, setIsMap] = useState(initialIsMap);
  const [showHint, setShowHint] = useState(false);
  useEffect(() => { setIsMap(initialIsMap); }, [initialIsMap]);
  useEffect(() => {
    function sync() { setIsMap(urlIsMap()); }
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  // [지도] 말풍선 — 하루 1회 노출 (피드 화면에 있을 때만)
  useEffect(() => {
    if (isMap) return;
    try {
      const key = `mlbg.maphint.${new Date().toISOString().slice(0, 10)}`;
      if (!sessionStorage.getItem(key) && !localStorage.getItem(key)) {
        setShowHint(true);
      }
    } catch { /* SSR / blocked storage */ }
  }, [isMap]);

  function dismissHint() {
    setShowHint(false);
    try {
      const key = `mlbg.maphint.${new Date().toISOString().slice(0, 10)}`;
      localStorage.setItem(key, '1');
    } catch { /* ignore */ }
  }

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    dismissHint();
    if (pathname === '/') {
      const next = isMap ? '/' : '/?view=map';
      window.history.pushState({}, '', next);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      router.push('/?view=map');
    }
  }

  // 오로라 — 그라디언트 위치만 천천히 이동. 음영/펄스 없음.
  const colorfulStyle: React.CSSProperties = !isMap ? {
    background: 'linear-gradient(135deg, #fbbf24 0%, #ec4899 50%, #0070C0 100%)',
    color: '#ffffff',
    borderColor: '#ffffff',
    borderWidth: '2px',
    borderStyle: 'solid',
  } : {};
  const baseCls = isMap
    ? 'bg-white/70 backdrop-blur-sm border border-border text-navy hover:bg-white hover:border-navy'
    : 'animate-aurora';

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2">
      {showHint && !isMap && (
        <button
          type="button"
          onClick={dismissHint}
          aria-label="안내 닫기"
          className="bg-navy text-white text-[12px] font-bold px-3 py-1.5 rounded-full shadow-lg cursor-pointer border-none animate-bounce"
        >
          [지도] 보기 →
        </button>
      )}
      <a
        href={isMap ? '/' : '/?view=map'}
        onClick={onClick}
        aria-label={isMap ? '피드로' : '지도로'}
        style={colorfulStyle}
        className={`w-11 h-11 rounded-full flex items-center justify-center no-underline transition-all ${baseCls}`}
      >
        {isMap ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2 C 7.6 2, 4 5.6, 4 10 C 4 16, 12 22, 12 22 C 12 22, 20 16, 20 10 C 20 5.6, 16.4 2, 12 2 Z M 12 12 C 10.3 12, 9 10.7, 9 9 C 9 7.3, 10.3 6, 12 6 C 13.7 6, 15 7.3, 15 9 C 15 10.7, 13.7 12, 12 12 Z" />
          </svg>
        )}
      </a>
    </div>
  );
}
