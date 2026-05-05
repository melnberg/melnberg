'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AptMap, { type FeedItem } from './AptMap';
import MobileFeedList from './MobileFeedList';
import MapMinimalEffects from './MapMinimalEffects';

// 모바일 (lg 미만) 한정 — 지도/피드 두 뷰를 모두 마운트해두고 CSS 로 스왑.
// URL 변경 (FloatingMapPin / MobileTopBar) 시 popstate → 뷰만 전환, 서버 RTT 0.
// 데스크톱 (lg+) 은 항상 지도 (AptMap) 만 풀크기로 노출.
function readViewFromUrl(sp: URLSearchParams): 'map' | 'feed' {
  if (sp.get('view') === 'map' || sp.has('apt') || sp.has('emart') || sp.has('factory')) return 'map';
  return 'feed';
}

export default function HomeMobileSwitcher({ feed, initialView }: { feed: FeedItem[]; initialView: 'map' | 'feed' }) {
  const sp = useSearchParams();
  const [view, setView] = useState<'map' | 'feed'>(initialView);

  // popstate (뒤로가기 / pushState 후 디스패치) 시 URL 다시 읽어 뷰 갱신
  useEffect(() => {
    function sync() {
      if (typeof window === 'undefined') return;
      setView(readViewFromUrl(new URLSearchParams(window.location.search)));
    }
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  // searchParams 가 Next.js navigation 으로 바뀌었을 때도 동기화 (예: Link 클릭)
  useEffect(() => {
    setView(readViewFromUrl(new URLSearchParams(sp.toString())));
  }, [sp]);

  const isMap = view === 'map';

  return (
    <>
      {/* 데스크톱 (lg+) 항상 지도. 모바일은 isMap 일 때만 보임. */}
      <div className={`flex-1 min-w-0 ${isMap ? 'map-minimal flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>
        <AptMap feed={feed} />
      </div>
      {/* 모바일 피드 — !isMap 일 때만 보임. lg+ 에서는 항상 숨김. */}
      <div className={`lg:hidden flex-1 min-w-0 ${isMap ? 'hidden' : ''}`}>
        <MobileFeedList items={feed} />
      </div>
      {/* 미니멀 모드 효과 (body 클래스 + map relayout) — 지도 뷰일 때만 마운트 */}
      {isMap && <MapMinimalEffects />}
    </>
  );
}
