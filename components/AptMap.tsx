'use client';

import { useEffect, useRef, useState } from 'react';
import AptDiscussionPanel from './AptDiscussionPanel';

// kakao maps SDK는 window.kakao로 전역 노출됨. 타입 정의 없이 최소 형태로 선언.
type KakaoLatLng = { __latlng: never };
type KakaoMarker = { __marker: never };
type KakaoMap = { __map: never };
type KakaoCluster = { getCenter: () => KakaoLatLng };
type KakaoSize = { __size: never };
type KakaoPoint = { __point: never };
type KakaoMarkerImage = { __mImage: never };
type KakaoMaps = {
  load: (cb: () => void) => void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Size: new (w: number, h: number) => KakaoSize;
  Point: new (x: number, y: number) => KakaoPoint;
  MarkerImage: new (src: string, size: KakaoSize, opts?: { offset?: KakaoPoint }) => KakaoMarkerImage;
  Map: new (container: HTMLElement, opts: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (opts: { position: KakaoLatLng; title?: string; map?: KakaoMap; clickable?: boolean; image?: KakaoMarkerImage }) => KakaoMarker;
  event: { addListener: (target: unknown, type: string, handler: (...args: unknown[]) => void) => void };
  MarkerClusterer: new (opts: {
    map: KakaoMap;
    averageCenter?: boolean;
    minLevel?: number;
    minClusterSize?: number;
    gridSize?: number;
    disableClickZoom?: boolean;
    markers?: KakaoMarker[];
    calculator?: number[];
    styles?: Array<Record<string, string>>;
  }) => { addMarkers: (m: KakaoMarker[]) => void };
};
type KakaoMapInst = KakaoMap & {
  getLevel: () => number;
  setLevel: (level: number, opts?: { anchor?: KakaoLatLng }) => void;
  setCenter: (latlng: KakaoLatLng) => void;
  panTo: (latlng: KakaoLatLng) => void;
};
type KakaoMarkerInst = KakaoMarker & { setMap: (map: KakaoMap | null) => void };
declare global {
  interface Window {
    kakao: { maps: KakaoMaps };
  }
}

export type AptPin = {
  id: number;
  apt_nm: string;
  dong: string | null;
  lawd_cd: string;
  lat: number;
  lng: number;
  household_count: number | null;
  building_count: number | null;
  kapt_build_year: number | null;
  kapt_code: string | null;
  geocoded_address: string | null;
};

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
const SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=clusterer`;

function loadKakaoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'));
    if (window.kakao && window.kakao.maps && window.kakao.maps.MarkerClusterer) return resolve();
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

// 클러스터 색상 단계 (CLAUDE.md 컬러 규칙: navy/blue/cyan 3색)
const CLUSTER_STYLES = [
  { background: '#00B0F0', color: '#fff', size: '36px' },   // 1~9
  { background: '#0070C0', color: '#fff', size: '42px' },   // 10~49
  { background: '#002060', color: '#fff', size: '50px' },   // 50~199
  { background: '#002060', color: '#fff', size: '60px' },   // 200+
].map((s) => ({
  background: s.background,
  color: s.color,
  width: s.size,
  height: s.size,
  borderRadius: '50%',
  textAlign: 'center',
  lineHeight: s.size,
  fontWeight: '700',
  fontSize: '13px',
  border: '2px solid rgba(255,255,255,0.7)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
}));

export default function AptMap({ pins }: { pins: AptPin[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstRef = useRef<KakaoMapInst | null>(null);
  const [selected, setSelected] = useState<AptPin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 검색 결과 — 단지명·동 조합 매칭. "봉천두산"·"두산"·"두산 봉천" 모두 매칭.
  const searchResults = (() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    return pins
      .filter((p) => {
        const dongFull = p.dong ?? '';
        const dongShort = dongFull.replace(/동$/, '');
        const targets = [
          p.apt_nm,
          `${dongShort}${p.apt_nm}`,
          `${dongFull}${p.apt_nm}`,
          `${p.apt_nm}${dongShort}`,
        ];
        return tokens.every((t) => targets.some((target) => target.includes(t)));
      })
      .slice(0, 8);
  })();

  function jumpToApt(p: AptPin) {
    const inst = mapInstRef.current;
    if (inst) {
      const ll = new window.kakao.maps.LatLng(p.lat, p.lng);
      inst.setLevel(2);
      inst.panTo(ll);
    }
    setSelected(p);
    setSearchQuery('');
  }

  useEffect(() => {
    if (!KAKAO_KEY) { setError('NEXT_PUBLIC_KAKAO_MAP_KEY 누락'); return; }
    let cancelled = false;

    loadKakaoSdk()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const center = new window.kakao.maps.LatLng(37.498, 127.027); // 강남 일대
        const map = new window.kakao.maps.Map(mapRef.current, { center, level: 6 }) as KakaoMapInst;
        mapInstRef.current = map;

        // 클러스터 제거 — 줌 단계로 작은 단지를 자동 숨김.
        // 핀 4종 + 작은 점 (소단지)
        const PIN_W = 32, PIN_H = 45;
        const makePin = (file: string) => new window.kakao.maps.MarkerImage(
          `/pins/${file}`,
          new window.kakao.maps.Size(PIN_W, PIN_H),
          { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) },
        );
        const pinRed = makePin('red_3000plus_2x.png');
        const pinOrange = makePin('orange_2000plus_2x.png');
        const pinGreen = makePin('green_1000plus_2x.png');
        const pinBlue = makePin('blue_under1000_2x.png');
        // 300 이하 / 미수집 → 파란 점 (28→20, 70%)
        const dotBlue = new window.kakao.maps.MarkerImage(
          '/pins/blue_dot.svg',
          new window.kakao.maps.Size(20, 20),
          { offset: new window.kakao.maps.Point(10, 10) },
        );

        function pickPin(hh: number | null) {
          if (hh === null) return dotBlue;
          if (hh >= 3000) return pinRed;
          if (hh >= 2000) return pinOrange;
          if (hh >= 1000) return pinGreen;
          if (hh >= 300) return pinBlue;
          return dotBlue;
        }

        // 마커 생성 — 클러스터러 사용 시 map 미설정 (클러스터러가 visibility 자동 관리).
        // 클러스터러 미사용 시에만 map에 직접 부착.
        // 4단계 줌별 가시성:
        //   tier 0 (≥2000): 항상 표시
        //   tier 1 (1000~1999, 초록): 줌 ≤7
        //   tier 2 (300~999, 파랑 핀): 줌 ≤5
        //   tier 3 (≤299/미수집, 파란 점): 줌 ≤4 (100m 스케일에서 보임)
        type MarkerTier = { marker: KakaoMarkerInst; tier: 0 | 1 | 2 | 3 };
        const allMarkers: MarkerTier[] = pins.map((p) => {
          const pos = new window.kakao.maps.LatLng(p.lat, p.lng);
          const marker = new window.kakao.maps.Marker({
            position: pos,
            title: p.apt_nm,
            clickable: true,
            image: pickPin(p.household_count),
            map,
          }) as KakaoMarkerInst;
          window.kakao.maps.event.addListener(marker, 'click', () => setSelected(p));
          const hh = p.household_count ?? 0;
          const tier: 0 | 1 | 2 | 3 = hh >= 2000 ? 0 : hh >= 1000 ? 1 : hh >= 300 ? 2 : 3;
          return { marker, tier };
        });

        function applyVisibility() {
          const level = map.getLevel();
          for (const { marker, tier } of allMarkers) {
            if (tier === 0) continue;
            const visible = (tier === 1 && level <= 7) || (tier === 2 && level <= 5) || (tier === 3 && level <= 4);
            marker.setMap(visible ? map : null);
          }
        }
        applyVisibility();
        window.kakao.maps.event.addListener(map, 'zoom_changed', applyVisibility);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => { cancelled = true; };
  }, [pins]);

  if (error) {
    return (
      <div className="max-w-content mx-auto px-10 py-12">
        <p className="text-red-600 text-sm">지도 로드 실패: {error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-screen bg-[#f0f0f0]" />

      {/* 좌상단 정보 카드 */}
      <div className="absolute top-4 left-4 bg-white border border-border px-4 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.08)] z-20">
        <div className="text-[11px] font-semibold tracking-wider text-cyan uppercase">아파트 토론방</div>
        <div className="text-sm font-bold text-navy mt-0.5">{pins.length.toLocaleString()}개 단지</div>
        <div className="text-[11px] text-muted mt-0.5">핀을 눌러 단지별 토론방으로 들어가세요</div>
      </div>

      {/* 가운데 하단 검색창 */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[420px] max-w-[calc(100vw-40px)] z-20">
        <div className="bg-white border border-border shadow-[0_8px_24px_rgba(0,0,0,0.12)] flex items-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="ml-4 text-muted flex-shrink-0">
            <circle cx={11} cy={11} r={7} />
            <line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults.length > 0) {
                e.preventDefault();
                jumpToApt(searchResults[0]);
              }
            }}
            placeholder="아파트 검색..."
            className="flex-1 px-3 py-3 text-sm focus:outline-none bg-transparent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="지우기"
              className="px-3 py-1 text-muted hover:text-navy"
            >
              ✕
            </button>
          )}
        </div>

        {searchResults.length > 0 && (
          <ul className="mt-1 bg-white border border-border shadow-[0_8px_24px_rgba(0,0,0,0.12)] max-h-[280px] overflow-y-auto">
            {searchResults.map((p) => (
              <li
                key={p.id}
                onClick={() => jumpToApt(p)}
                className="px-4 py-2.5 border-b border-[#f0f0f0] last:border-b-0 cursor-pointer hover:bg-navy-soft"
              >
                <div className="text-[13px] font-bold text-navy">{p.apt_nm}</div>
                {p.dong && <div className="text-[11px] text-muted mt-0.5">{p.dong}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 우측 하단 범례 — 핀 색상별 세대수 (투명 배경, 시야 안 가리게) */}
      <div className="absolute bottom-8 right-6 z-20 pointer-events-none">
        <div className="text-[11px] font-bold text-navy mb-1.5 tracking-wider uppercase drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">세대수</div>
        <ul className="space-y-1 text-[12px]">
          <li className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-[#C8392E] shadow-[0_0_2px_rgba(255,255,255,0.8)]" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">3000+ 대단지</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-[#E8772E] shadow-[0_0_2px_rgba(255,255,255,0.8)]" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">2000~2999</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-[#2D7A4F] shadow-[0_0_2px_rgba(255,255,255,0.8)]" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">1000~1999</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-[#3066BE] shadow-[0_0_2px_rgba(255,255,255,0.8)]" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">300~999</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-[#3066BE] border border-white" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">~299 (소단지)</span>
          </li>
        </ul>
      </div>

      {selected && <AptDiscussionPanel apt={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
