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
    disableClickZoom?: boolean;
    markers?: KakaoMarker[];
    calculator?: number[];
    styles?: Array<Record<string, string>>;
  }) => { addMarkers: (m: KakaoMarker[]) => void };
};
type KakaoMapInst = KakaoMap & { getLevel: () => number; setLevel: (level: number, opts?: { anchor?: KakaoLatLng }) => void };
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
  const [selected, setSelected] = useState<AptPin | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!KAKAO_KEY) { setError('NEXT_PUBLIC_KAKAO_MAP_KEY 누락'); return; }
    let cancelled = false;

    loadKakaoSdk()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        const center = new window.kakao.maps.LatLng(37.498, 127.027); // 강남 일대
        const map = new window.kakao.maps.Map(mapRef.current, { center, level: 6 }) as KakaoMapInst;

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
          // minLevel: 2 → 줌 2 이상에서 클러스터, 줌 1에서만 개별 마커 (가장 가까운 줌)
          //   (4500개 단지를 멀리서 한꺼번에 띄우면 너무 빽빽 — 동네 단위 줌인까지 클러스터 유지)
          const clusterer = new window.kakao.maps.MarkerClusterer({
            map,
            averageCenter: true,
            minLevel: 2,
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
      <div className="absolute top-4 left-4 bg-white border border-border px-4 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
        <div className="text-[11px] font-semibold tracking-wider text-cyan uppercase">아파트 토론방</div>
        <div className="text-sm font-bold text-navy mt-0.5">{pins.length.toLocaleString()}개 단지</div>
        <div className="text-[11px] text-muted mt-0.5">핀을 눌러 단지별 토론방으로 들어가세요</div>
      </div>

      {selected && <AptDiscussionPanel apt={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
