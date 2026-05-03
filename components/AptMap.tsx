'use client';

import { useEffect, useRef, useState } from 'react';

// kakao maps SDK는 window.kakao로 전역 노출됨. 타입 정의 없이 최소 형태로 선언.
type KakaoMaps = {
  load: (cb: () => void) => void;
  LatLng: new (lat: number, lng: number) => unknown;
  Map: new (container: HTMLElement, opts: { center: unknown; level: number }) => unknown;
  Marker: new (opts: { position: unknown; map: unknown; title?: string }) => unknown;
  event: { addListener: (target: unknown, type: string, handler: () => void) => void };
};
declare global {
  interface Window {
    kakao: { maps: KakaoMaps };
  }
}

type Apt = {
  id: string;
  name: string;
  dong: string;
  lat: number;
  lng: number;
};

// Phase B — 하드코딩 핀 (시각 검증용). 진짜 좌표는 Phase C에서 apt_master view로 교체.
const SAMPLE_APTS: Apt[] = [
  { id: 'banpo-jai',      name: '반포자이',          dong: '반포동',   lat: 37.5076, lng: 127.0094 },
  { id: 'rae-perstige',   name: '래미안퍼스티지',     dong: '반포동',   lat: 37.5063, lng: 127.0079 },
  { id: 'acro-river',     name: '아크로리버파크',     dong: '반포동',   lat: 37.5108, lng: 127.0024 },
  { id: 'jamsil-jugong5', name: '잠실주공5단지',      dong: '잠실동',   lat: 37.5118, lng: 127.0820 },
  { id: 'dogok-rexle',    name: '도곡렉슬',          dong: '도곡동',   lat: 37.4853, lng: 127.0467 },
  { id: 'eunma',          name: '은마아파트',         dong: '대치동',   lat: 37.4998, lng: 127.0606 },
  { id: 'helio',          name: '헬리오시티',         dong: '가락동',   lat: 37.5054, lng: 127.1036 },
  { id: 'gaepo-jugong1',  name: '래미안블레스티지',   dong: '개포동',   lat: 37.4799, lng: 127.0497 },
];

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
const SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;

function loadKakaoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'));
    if (window.kakao && window.kakao.maps) return resolve();
    const existing = document.querySelector(`script[src^="https://dapi.kakao.com/v2/maps/sdk.js"]`);
    if (existing) {
      existing.addEventListener('load', () => window.kakao.maps.load(() => resolve()));
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => reject(new Error('kakao sdk load failed'));
    document.head.appendChild(s);
  });
}

export default function AptMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Apt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!KAKAO_KEY) { setError('NEXT_PUBLIC_KAKAO_MAP_KEY 누락'); return; }
    let cancelled = false;

    loadKakaoSdk()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const center = new window.kakao.maps.LatLng(37.498, 127.027); // 강남 일대
        const map = new window.kakao.maps.Map(mapRef.current, { center, level: 6 });

        for (const apt of SAMPLE_APTS) {
          const pos = new window.kakao.maps.LatLng(apt.lat, apt.lng);
          const marker = new window.kakao.maps.Marker({ position: pos, map, title: apt.name });
          window.kakao.maps.event.addListener(marker, 'click', () => setSelected(apt));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="max-w-content mx-auto px-10 py-12">
        <p className="text-red-600 text-sm">지도 로드 실패: {error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-[calc(100vh-240px)] min-h-[500px] bg-[#f0f0f0]" />

      {selected && (
        <aside className="absolute top-0 right-0 h-full w-[360px] max-w-full bg-white border-l border-border shadow-[-8px_0_24px_rgba(0,0,0,0.06)] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-cyan uppercase">{selected.dong}</div>
              <h2 className="text-[18px] font-bold text-navy tracking-tight">{selected.name}</h2>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="닫기"
              className="w-8 h-8 flex items-center justify-center text-muted hover:text-navy"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="text-sm text-muted leading-relaxed">
              아직 이 단지에 대한 글이 없어요. 첫 글로 평가·후기를 남겨보세요.
            </div>
          </div>

          <div className="border-t border-border px-6 py-4">
            <button
              type="button"
              className="w-full bg-navy text-white py-3 px-4 text-sm font-bold tracking-wide hover:bg-navy-dark transition-colors"
              disabled
              title="다음 단계에서 활성화"
            >
              글쓰기 (준비중)
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
