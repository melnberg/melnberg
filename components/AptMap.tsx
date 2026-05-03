'use client';

import { useEffect, useRef, useState } from 'react';
import AptDiscussionPanel from './AptDiscussionPanel';

// kakao maps SDK는 window.kakao로 전역 노출됨. 타입 정의 없이 최소 형태로 선언.
type KakaoLatLng = { __latlng: never };
type KakaoMarker = { __marker: never };
type KakaoMap = { __map: never };
type KakaoCluster = { getCenter: () => KakaoLatLng };
type KakaoMaps = {
  load: (cb: () => void) => void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (container: HTMLElement, opts: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (opts: { position: KakaoLatLng; title?: string; map?: KakaoMap; clickable?: boolean }) => KakaoMarker;
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

  // 검색 결과 — 단지명 부분 매칭, 최대 8개
  const searchResults = searchQuery.trim().length >= 1
    ? pins.filter((p) => p.apt_nm.includes(searchQuery.trim())).slice(0, 8)
    : [];

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

        const useClusterer = !!window.kakao.maps.MarkerClusterer;

        // 마커 생성 — 클러스터러 사용 시 map 미설정 (클러스터러가 visibility 자동 관리).
        // 클러스터러 미사용 시에만 map에 직접 부착.
        const markers: KakaoMarker[] = pins.map((p) => {
          const pos = new window.kakao.maps.LatLng(p.lat, p.lng);
          const marker = new window.kakao.maps.Marker({
            position: pos,
            title: p.apt_nm,
            clickable: true,
            ...(useClusterer ? {} : { map }),
          });
          window.kakao.maps.event.addListener(marker, 'click', () => setSelected(p));
          return marker;
        });

        if (useClusterer) {
          // disableClickZoom: true → 클러스터 click을 우리가 직접 처리
          // minLevel: 3 → 줌 3 이상에서 클러스터, 줌 1·2에선 개별 마커 (가장 가까운 두 단계)
          // gridSize: 35 → 가까이 있는 마커는 더 일찍 분리 (default 60)
          const clusterer = new window.kakao.maps.MarkerClusterer({
            map,
            averageCenter: true,
            minLevel: 3,
            gridSize: 35,
            disableClickZoom: true,
            markers,
            calculator: [10, 50, 200],
            styles: CLUSTER_STYLES,
          });
          // 클러스터 클릭 → 줌인 (마커 click과 분리)
          window.kakao.maps.event.addListener(clusterer, 'clusterclick', (...args: unknown[]) => {
            const cluster = args[0] as KakaoCluster;
            const level = map.getLevel() - 2;
            map.setLevel(level < 1 ? 1 : level, { anchor: cluster.getCenter() });
          });
        }
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

      {selected && <AptDiscussionPanel apt={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
