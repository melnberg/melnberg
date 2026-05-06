'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AptDiscussionPanel from './AptDiscussionPanel';
import EmartPanel from './EmartPanel';
import FactoryPanel, { type FactoryItem } from './FactoryPanel';
import Countdown from './Countdown';
import RewardTooltip from './RewardTooltip';
import { notifyTelegram } from '@/lib/telegram-notify';
import { createClient } from '@/lib/supabase/client';
import Nickname from './Nickname';
import { feedItemToNicknameInfo } from '@/lib/nickname-info';

// kakao maps SDK는 window.kakao로 전역 노출됨. 타입 정의 없이 최소 형태로 선언.
type KakaoLatLng = { __latlng: never };
type KakaoMarker = { __marker: never };
type KakaoMap = { __map: never };
type KakaoCluster = { getCenter: () => KakaoLatLng };
type KakaoSize = { __size: never };
type KakaoPoint = { __point: never };
type KakaoMarkerImage = { __mImage: never };
type KakaoCustomOverlay = { __overlay: never };
type KakaoMaps = {
  load: (cb: () => void) => void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Size: new (w: number, h: number) => KakaoSize;
  Point: new (x: number, y: number) => KakaoPoint;
  MarkerImage: new (src: string, size: KakaoSize, opts?: { offset?: KakaoPoint }) => KakaoMarkerImage;
  Map: new (container: HTMLElement, opts: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (opts: { position: KakaoLatLng; title?: string; map?: KakaoMap; clickable?: boolean; image?: KakaoMarkerImage }) => KakaoMarker;
  CustomOverlay: new (opts: { position: KakaoLatLng; content: string | HTMLElement; yAnchor?: number; xAnchor?: number; zIndex?: number; clickable?: boolean; map?: KakaoMap }) => KakaoCustomOverlay;
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
  services: {
    Places: new () => {
      keywordSearch: (keyword: string, callback: (data: Array<{ id: string; place_name: string; address_name: string; road_address_name: string; x: string; y: string }>, status: string, pagination: { hasNextPage: boolean; nextPage: () => void; current: number; totalCount: number }) => void, opts?: { page?: number; size?: number; useMapBounds?: boolean }) => void;
    };
    Status: { OK: string; ZERO_RESULT: string; ERROR: string };
  };
};
type KakaoMapInst = KakaoMap & {
  getLevel: () => number;
  setLevel: (level: number, opts?: { anchor?: KakaoLatLng }) => void;
  setCenter: (latlng: KakaoLatLng) => void;
  panTo: (latlng: KakaoLatLng) => void;
};
type KakaoMarkerInst = KakaoMarker & { setMap: (map: KakaoMap | null) => void };
type KakaoOverlayInst = KakaoCustomOverlay & { setMap: (map: KakaoMap | null) => void };
declare global {
  interface Window {
    kakao: { maps: KakaoMaps };
  }
}

export type FeedItem = {
  kind: 'discussion' | 'comment' | 'post' | 'post_comment' | 'listing' | 'offer' | 'snatch' | 'auction' | 'auction_bid' | 'auction_won' | 'notice' | 'emart_occupy' | 'factory_occupy' | 'emart_comment' | 'factory_comment' | 'strike' | 'bridge_toll' | 'sell_complete';
  /** emart 전용 — 매장명 (이미 apt_nm 으로도 들어가지만 의미 명확화용) */
  emart_name?: string;
  /** notice 전용 — 외부 링크 (있으면 클릭 시 그 URL 또는 라우트로) */
  notice_href?: string;
  /** 경매 전용 — 종료 시각 */
  ends_at?: string;
  /** 경매 전용 — auction id (jumpToFeedItem 라우팅용) */
  auction_id?: number;
  id: number;
  apt_master_id: number;
  post_id: number | null;
  title: string;
  content: string | null;
  created_at: string;
  apt_nm: string | null;
  dong: string | null;
  lat: number | null;
  lng: number | null;
  author_id: string | null;
  author_name: string | null;
  author_link: string | null;
  author_is_paid: boolean;
  author_is_solo: boolean;
  author_avatar_url: string | null;
  author_apt_count: number | null;
  /** 단지 댓글(comment) 전용 — 부모 토론글 id */
  discussion_id?: number;
  /** 댓글 수 (피드 카드 우측하단 말풍선용). discussion/post/emart_occupy/factory_occupy 만 채움. */
  comment_count?: number;
  /** 매물(listing) 전용 — 호가 mlbg */
  listing_price?: number | null;
  /** 작성으로 받은 mlbg (AI 평가 결과). null = 아직 적립 전이거나 적립 안 됨. */
  earned_mlbg?: number | null;
  /** post / post_comment 의 카테고리 — 'community' | 'hotdeal'. 라우팅·뱃지 분기용. */
  post_category?: 'community' | 'hotdeal';
  /** strike 전용 — 손실 % 와 mlbg 액수 */
  strike_loss_pct?: number;
  strike_loss_mlbg?: number;
  /** discussion 전용 — 찐리뷰 좋아요 카운트 */
  discussion_like_count?: number;
  /** bridge_toll 전용 — 다리명 / 통행료 / 통행자·소유주 닉네임 */
  bridge_name?: string | null;
  bridge_toll_amount?: number;
  bridge_payer_name?: string | null;
  bridge_owner_name?: string | null;
  /** sell_complete 전용 — 매도가 (snatch 면 0) */
  sell_price?: number;
  sell_buyer_name?: string | null;
  sell_seller_name?: string | null;
};

export type AptPin = {
  id: number;
  apt_nm: string;
  dong: string | null;
  lawd_cd: string | null;
  lat: number;
  lng: number;
  household_count: number | null;
  building_count: number | null;
  kapt_build_year: number | null;
  geocoded_address: string | null;
  occupier_id: string | null;
  occupied_at: string | null;
  listing_price: number | null;
  pyeong_price: number | null;
};

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
const SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=clusterer,services`;

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

// 핀 색상
const PIN_COLORS = {
  red: '#C8392E',
  orange: '#E8772E',
  green: '#2D7A4F',
  blue: '#3066BE',
};

// 물방울 모양 핀 SVG. 단색 + 광택. 점거 시 흰 삼각 깃발 추가.
function buildPinSvg(color: string, occupied: boolean, listed: boolean = false): string {
  // 깃발: 흰색 + 검정 테두리. 사이즈 20% 축소.
  // 깃대: 검정 outer + 흰 inner (테두리 효과). 삼각: 흰 fill + 검정 stroke.
  const flag = occupied
    ? '<line x1="11" y1="7.5" x2="11" y2="24.5" stroke="#1a1d22" stroke-width="3.6" stroke-linecap="round"/><line x1="11" y1="8" x2="11" y2="24" stroke="white" stroke-width="2.2" stroke-linecap="round"/><polygon points="11,8 23,13 11,18" fill="white" stroke="#1a1d22" stroke-width="0.9" stroke-linejoin="round"/>'
    : '';
  // 매물 등록: 우상단에 노란 "$" 뱃지. 깃발이 있으면 살짝 옆으로.
  const saleBadge = listed
    ? '<g><circle cx="25" cy="7" r="6" fill="#FFD400" stroke="#1a1d22" stroke-width="1.5"/><text x="25" y="10" font-family="Arial,sans-serif" font-size="9" font-weight="900" fill="#1a1d22" text-anchor="middle">$</text></g>'
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="45" viewBox="0 0 32 45">
<defs><radialGradient id="g" cx="35%" cy="30%" r="60%"><stop offset="0%" stop-color="white" stop-opacity="0.55"/><stop offset="60%" stop-color="white" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="16" cy="42" rx="6.5" ry="2" fill="rgba(0,0,0,0.22)"/>
<path d="M16 1.5 C 7 1.5, 2 8, 2 17 C 2 28, 16 41.5, 16 41.5 C 16 41.5, 30 28, 30 17 C 30 8, 25 1.5, 16 1.5 Z" fill="${color}" stroke="#1a1d22" stroke-width="2"/>
<path d="M16 1.5 C 7 1.5, 2 8, 2 17 C 2 28, 16 41.5, 16 41.5 C 16 41.5, 30 28, 30 17 C 30 8, 25 1.5, 16 1.5 Z" fill="url(#g)" stroke="none"/>
${flag}
${saleBadge}
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
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

// 마커 메타 — 오버레이는 lazy create (성능)
type MarkerEntry = {
  marker: KakaoMarkerInst;
  overlay: KakaoOverlayInst | null;  // 줌 레벨 도달 시 lazy 생성
  pyeongPrice: number | null;        // 라벨 표시할 평당가 (없으면 null — overlay 안 만듦)
  pos: KakaoLatLng;
  lat: number;
  lng: number;
  hh: number;
  occupied: boolean;
  listed: boolean;
};

// v4: 경매 낙찰 후 점거 상태 전파 안 되던 문제 — 강제 fresh fetch
const PINS_CACHE_KEY_BIG = 'mlbg_pins_big_v5';
const PINS_CACHE_KEY_SMALL = 'mlbg_pins_small_v5';
const PINS_CACHE_TTL_MS = 5 * 60 * 1000; // 5분 — 서버 캐시와 동일

function readPinCache(key: string): { ts: number; pins: AptPin[] } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as { ts: number; pins: AptPin[] };
  } catch { return null; }
}
function writePinCache(key: string, pins: AptPin[]) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), pins })); } catch { /* quota */ }
}

// 본문에 섞인 이미지 URL → <img> 인라인 렌더 (피드 카드 공용).
const FEED_IMG_URL_RE = /(https?:\/\/[^\s]+?\.(?:jpe?g|png|gif|webp)(?:\?[^\s]*)?)/gi;
function renderFeedContentWithImages(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(FEED_IMG_URL_RE);
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      return (
        <a key={i} href={p} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block my-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p} alt="" loading="lazy" className="max-w-full max-h-[200px] object-contain border border-border" />
        </a>
      );
    }
    return p ? <span key={i}>{p}</span> : null;
  });
}

export default function AptMap({ pins: pinsFromProps, feed = [] }: { pins?: AptPin[]; feed?: FeedItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 핀은 두 단계로 로드:
  //   1단계 (즉시): 큰 단지 + 점거 단지 — 작아서 빠름
  //   2단계 (1초 후): 100~999세대 중소형 — 화면이 응답성 갖춘 뒤 백그라운드
  // localStorage 캐시 → 두 번째 방문부터 거의 즉시 표시.
  const [pins, setPins] = useState<AptPin[]>(pinsFromProps ?? []);
  useEffect(() => {
    if (pinsFromProps && pinsFromProps.length > 0) return;

    let cancelled = false;
    const bigPins: AptPin[] = [];
    const smallPins: AptPin[] = [];

    function applyPins() {
      if (cancelled) return;
      // 중복 제거 (id 기준)
      const seen = new Set<number>();
      const merged: AptPin[] = [];
      for (const p of [...bigPins, ...smallPins]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        merged.push(p);
      }
      setPins(merged);
    }

    // 1단계: 큰 단지·점거 단지 — 캐시 우선
    const cachedBig = readPinCache(PINS_CACHE_KEY_BIG);
    const cachedBigHasPins = !!cachedBig?.pins?.length;
    if (cachedBigHasPins) {
      bigPins.push(...cachedBig!.pins);
      applyPins();
    }
    // 캐시 없거나 / 비어있거나 / 만료됐으면 fresh fetch
    if (!cachedBigHasPins || Date.now() - cachedBig!.ts >= PINS_CACHE_TTL_MS) {
      (async () => {
        try {
          const r = await fetch('/api/home-pins');
          if (!r.ok) return; // 503 등 서버 에러 — 기존 cached 핀 유지
          const json = (await r.json()) as { pins: AptPin[] };
          if (cancelled) return;
          // 빈 응답을 받으면 절대 화면 비우지 않음 — cached/이전 상태 유지.
          // 서버가 지금은 503 으로 막지만 안전장치 이중 방어.
          if (!json.pins || json.pins.length === 0) return;
          bigPins.length = 0;
          bigPins.push(...json.pins);
          writePinCache(PINS_CACHE_KEY_BIG, json.pins);
          applyPins();
        } catch { /* ignore — 기존 cached 핀 유지 */ }
      })();
    }

    // 2단계: 1초 뒤 중소형 — 캐시 우선
    const smallTimer = setTimeout(() => {
      if (cancelled) return;
      const cachedSmall = readPinCache(PINS_CACHE_KEY_SMALL);
      const cachedSmallHasPins = !!cachedSmall?.pins?.length;
      if (cachedSmallHasPins) {
        smallPins.push(...cachedSmall!.pins);
        applyPins();
      }
      if (!cachedSmallHasPins || Date.now() - cachedSmall!.ts >= PINS_CACHE_TTL_MS) {
        (async () => {
          try {
            const r = await fetch('/api/home-pins?detail=1');
            if (!r.ok) return;
            const json = (await r.json()) as { pins: AptPin[] };
            if (cancelled) return;
            if (!json.pins || json.pins.length === 0) return; // 안전장치 — 빈 응답시 cached 유지
            smallPins.length = 0;
            smallPins.push(...json.pins);
            writePinCache(PINS_CACHE_KEY_SMALL, json.pins);
            applyPins();
          } catch { /* ignore — cached 유지 */ }
        })();
      }
    }, 1000);

    return () => { cancelled = true; clearTimeout(smallTimer); };
  }, [pinsFromProps]);

  // Supabase Realtime — apt_master + 글/댓글 테이블 변경 시 즉시 반영
  // apt_master UPDATE: 점거인 변경 → 핀 갱신
  // 글/댓글 INSERT: 피드 갱신 (RSC refresh)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('mlbg-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'apt_master' }, () => {
        window.dispatchEvent(new Event('mlbg-pins-changed'));
        router.refresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'apt_discussions' }, () => router.refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'apt_discussion_comments' }, () => router.refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => router.refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [router]);

  // 점거/강제집행 액션 후 핀 갱신 — 서버 응답 성공시에만 캐시·상태 갱신.
  // 서버가 503 반환하면 기존 cached 핀 그대로 유지 → 화면 안 비워짐.
  useEffect(() => {
    function onPinsChanged() {
      (async () => {
        try {
          const [bigR, smallR] = await Promise.all([
            fetch('/api/home-pins?fresh=1', { cache: 'no-store' }),
            fetch('/api/home-pins?detail=1&fresh=1', { cache: 'no-store' }),
          ]);
          if (!bigR.ok || !smallR.ok) return; // 둘 중 하나라도 실패시 그대로
          const bigJson = (await bigR.json()) as { pins: AptPin[] };
          const smallJson = (await smallR.json()) as { pins: AptPin[] };
          if (!bigJson.pins?.length || !smallJson.pins?.length) return; // 빈 응답 안전장치
          writePinCache(PINS_CACHE_KEY_BIG, bigJson.pins);
          writePinCache(PINS_CACHE_KEY_SMALL, smallJson.pins);
          const seen = new Set<number>();
          const merged: AptPin[] = [];
          for (const p of [...bigJson.pins, ...smallJson.pins]) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            merged.push(p);
          }
          setPins(merged);
        } catch { /* ignore — cached 유지 */ }
      })();
    }
    window.addEventListener('mlbg-pins-changed', onPinsChanged);
    return () => window.removeEventListener('mlbg-pins-changed', onPinsChanged);
  }, []);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstRef = useRef<KakaoMapInst | null>(null);
  const markersRef = useRef<MarkerEntry[]>([]);
  // 별도 overlaysRef 더 이상 필요 없음 — MarkerEntry.overlay 로 통합. 호환 위해 유지.
  const overlaysRef = useRef<KakaoOverlayInst[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<AptPin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [occupiedOpen, setOccupiedOpen] = useState(false);

  // 이마트 — 분양 가능한 새 대상 (5 mlbg, 1인 1점포)
  type EmartItem = { id: number; kakao_place_id: string; name: string; address: string | null; lat: number; lng: number; occupier_id: string | null; occupier_name: string | null; occupied_at?: string | null; last_claimed_at?: string | null };
  const [emartList, setEmartList] = useState<EmartItem[]>([]);
  const [selectedEmart, setSelectedEmart] = useState<EmartItem | null>(null);
  const emartMarkersRef = useRef<KakaoMarkerInst[]>([]);

  // 공장 (하이닉스/삼성/코스트코/금속노조)
  const [factoryList, setFactoryList] = useState<FactoryItem[]>([]);
  const [selectedFactory, setSelectedFactory] = useState<FactoryItem | null>(null);
  const factoryMarkersRef = useRef<KakaoMarkerInst[]>([]);
  async function refetchFactory() {
    try {
      const r = await fetch('/api/factory-list', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const items = (j.items ?? []) as FactoryItem[];
      setFactoryList(items);
      // 현재 열려있는 패널의 데이터도 같이 갱신 — 점거/매도 직후 stale 표시 방지
      setSelectedFactory((cur) => cur ? (items.find((x) => x.id === cur.id) ?? cur) : null);
    } catch { /* silent */ }
  }
  useEffect(() => { refetchFactory(); }, []);

  useEffect(() => {
    if (!mapReady || !mapInstRef.current) return;
    const map = mapInstRef.current;
    for (const m of factoryMarkersRef.current) m.setMap(null);
    factoryMarkersRef.current = [];
    if (factoryList.length === 0) return;
    const PIN_W = 32, PIN_H = 45;
    const imgs: Record<string, KakaoMarkerImage> = {
      hynix:   new window.kakao.maps.MarkerImage('/pins/factory-hynix.svg',   new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      samsung: new window.kakao.maps.MarkerImage('/pins/factory-samsung.svg', new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      costco:  new window.kakao.maps.MarkerImage('/pins/factory-costco.svg',  new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      union:   new window.kakao.maps.MarkerImage('/pins/factory-union.svg',   new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      cargo:    new window.kakao.maps.MarkerImage('/pins/factory-cargo.svg',    new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      terminal: new window.kakao.maps.MarkerImage('/pins/factory-terminal.svg', new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      station:  new window.kakao.maps.MarkerImage('/pins/factory-station.svg',  new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      party_dem:   new window.kakao.maps.MarkerImage('/pins/factory-party-dem.svg',   new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      party_ppl:   new window.kakao.maps.MarkerImage('/pins/factory-party-ppl.svg',   new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      party_jhs:   new window.kakao.maps.MarkerImage('/pins/factory-party-jhs.svg',   new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      party_ref:   new window.kakao.maps.MarkerImage('/pins/factory-party-ref.svg',   new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      party_jin:   new window.kakao.maps.MarkerImage('/pins/factory-party-jin.svg',   new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      party_basic: new window.kakao.maps.MarkerImage('/pins/factory-party-basic.svg', new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      party_sd:    new window.kakao.maps.MarkerImage('/pins/factory-party-sd.svg',    new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      park:        new window.kakao.maps.MarkerImage('/pins/factory-park.svg',        new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      amusement:   new window.kakao.maps.MarkerImage('/pins/factory-amusement.svg',   new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
      bridge:      new window.kakao.maps.MarkerImage('/pins/factory-bridge.svg',      new window.kakao.maps.Size(PIN_W, PIN_H), { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) }),
    };
    for (const f of factoryList) {
      const pos = new window.kakao.maps.LatLng(f.lat, f.lng);
      const marker = new window.kakao.maps.Marker({
        position: pos,
        title: f.occupier_id ? `${f.name} — ${f.occupier_name ?? '점거됨'} 보유` : `${f.name} (${f.occupy_price.toLocaleString()} mlbg 분양)`,
        clickable: true,
        image: imgs[f.brand] ?? imgs.hynix,
        map,
      }) as KakaoMarkerInst;
      window.kakao.maps.event.addListener(marker, 'click', () => {
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          router.push(`/f/${f.id}`);
        } else {
          setSelectedFactory(f);
        }
      });
      factoryMarkersRef.current.push(marker);
    }
    return () => {
      for (const m of factoryMarkersRef.current) m.setMap(null);
      factoryMarkersRef.current = [];
    };
  }, [factoryList, mapReady]);

  async function refetchEmart() {
    try {
      const r = await fetch('/api/emart-list', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      const items = (j.items ?? []) as EmartItem[];
      setEmartList(items);
      setSelectedEmart((cur) => cur ? (items.find((x) => x.id === cur.id) ?? cur) : null);
    } catch { /* silent */ }
  }

  // 진행중 경매 — 60초 폴링, 좌측 LIVE 배너 표시용
  const [liveAuctions, setLiveAuctions] = useState<Array<{ id: number; apt_nm: string | null; current_bid: number | null; min_bid: number; ends_at: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    async function fetchLive() {
      try {
        const r = await fetch('/api/active-auctions');
        if (!r.ok) return;
        const json = await r.json();
        if (cancelled) return;
        setLiveAuctions((json.auctions ?? []).slice(0, 3));
      } catch { /* silent */ }
    }
    fetchLive();
    const id = setInterval(fetchLive, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  const [occupierProfiles, setOccupierProfiles] = useState<Map<string, { name: string; link: string | null; isPaid: boolean; isSolo: boolean; avatarUrl: string | null; aptCount: number | null }>>(new Map());
  const aiTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ?apt={id} query 로 진입 시 해당 단지 패널 자동 열기 (알림 종 / 디테일 페이지 지도 핀 클릭 흐름)
  // URL 에 &lat=&lng= 가 있으면 pins 로딩 기다리지 않고 즉시 panTo → '강남역 1초 flash' 차단.
  // 줌 레벨 4 (이전 3 → 한 단계 줄아웃, 주변 환경 같이 보이게).
  useEffect(() => {
    const aptParam = searchParams.get('apt');
    if (!aptParam) return;
    const aptId = Number(aptParam);
    if (Number.isNaN(aptId)) return;

    // 즉시 panTo — URL 의 lat/lng 우선 (pins 미로딩 상태에서도 바로 이동)
    const inst = mapInstRef.current;
    const latParam = Number(searchParams.get('lat'));
    const lngParam = Number(searchParams.get('lng'));
    if (inst && Number.isFinite(latParam) && Number.isFinite(lngParam) && latParam !== 0 && lngParam !== 0) {
      const ll = new window.kakao.maps.LatLng(latParam, lngParam);
      inst.setLevel(4);
      inst.panTo(ll);
    }

    // 핀 로딩 후 패널 자동 오픈 (+ pins 로 fallback panTo)
    if (pins.length === 0) return;
    const pin = pins.find((p) => p.id === aptId);
    if (pin) {
      setSelected(pin);
      // URL 에 lat/lng 없었으면 여기서 pin 좌표로 한 번 이동
      if (inst && !(Number.isFinite(latParam) && Number.isFinite(lngParam) && latParam !== 0)) {
        inst.setLevel(4);
        inst.panTo(new window.kakao.maps.LatLng(pin.lat, pin.lng));
      }
    }
  }, [searchParams, pins, router]);

  // ?emart={id} / ?factory={id} — 모바일 피드에서 시설로 진입 시 해당 패널 자동 열기
  useEffect(() => {
    const emartParam = searchParams.get('emart');
    if (emartParam && emartList.length > 0) {
      const id = Number(emartParam);
      const e = emartList.find((x) => x.id === id);
      if (e) {
        setSelectedEmart(e);
        const inst = mapInstRef.current;
        if (inst) { inst.setLevel(3); inst.panTo(new window.kakao.maps.LatLng(e.lat, e.lng)); }
      }
    }
    const factoryParam = searchParams.get('factory');
    if (factoryParam && factoryList.length > 0) {
      const id = Number(factoryParam);
      const f = factoryList.find((x) => x.id === id);
      if (f) {
        setSelectedFactory(f);
        const inst = mapInstRef.current;
        if (inst) { inst.setLevel(3); inst.panTo(new window.kakao.maps.LatLng(f.lat, f.lng)); }
      }
    }
  }, [searchParams, emartList, factoryList, router]);

  // 오늘의 매매 (sell 이벤트). 강제집행 폐기 후 매매 활동성 표시.
  type EvictEvent = { occurred_at: string; actor_name: string | null; prev_occupier_name: string | null; actor_score: number | null; apt_id: number; apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null };
  const [evictsOpen, setEvictsOpen] = useState(false);
  const [evicts, setEvicts] = useState<EvictEvent[] | null>(null);
  const [evictCount, setEvictCount] = useState(0);

  // 스코어 랭킹 + 자산 랭킹 + 실거래 하이라이트 + 거래 활발 단지
  type RankRow = { user_id: string; display_name: string; score: number };
  type WealthRow = { user_id: string; display_name: string; total_wealth: number; apt_count: number };
  type TradeHighlight = { apt_nm: string; deal_amount: number; excl_use_ar: number; deal_date: string };
  type TradedApt = { apt_id: number | null; apt_nm: string; trade_count: number; median_amount: number };
  type ActivityStats = { posts_today: number; apt_posts_today: number; comments_today: number; apt_comments_today: number; new_users_today: number; checkins_today: number; claims_today: number };
  type QualityAward = { kind: string; ref_id: number; earned: number; multiplier: number; title: string | null; apt_nm: string | null; author_name: string | null };
  type SellEvent = { apt_id: number; apt_nm: string | null; buyer_name: string | null; seller_name: string | null; price: number; occurred_at: string };
  type ActiveOffer = { offer_id: number; apt_id: number; apt_nm: string | null; buyer_name: string | null; price: number; kind: string };
  type HotdealItem = { post_id: number; title: string; author_name: string | null; created_at: string };
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [wealthRanking, setWealthRanking] = useState<WealthRow[]>([]);
  const [tradeHighlights, setTradeHighlights] = useState<TradeHighlight[]>([]);
  const [hotApts, setHotApts] = useState<TradedApt[]>([]);
  const [activityStats, setActivityStats] = useState<ActivityStats | null>(null);
  const [qualityAwards, setQualityAwards] = useState<QualityAward[]>([]);
  const [todaySells, setTodaySells] = useState<SellEvent[]>([]);
  const [activeOffers, setActiveOffers] = useState<ActiveOffer[]>([]);
  const [recentHotdeals, setRecentHotdeals] = useState<HotdealItem[]>([]);
  type RankMode = 'score' | 'wealth' | 'trade' | 'hot' | 'activity' | 'quality' | 'sells' | 'offers' | 'hotdeals';
  const [rankMode, setRankMode] = useState<RankMode>('score');
  // 모드 전환 컨베이어 — outgoing 이 잠시 표시되면서 위로 밀려나감
  const prevModeRef = useRef<RankMode>('score');
  const [outgoingMode, setOutgoingMode] = useState<RankMode | null>(null);
  useEffect(() => {
    if (prevModeRef.current !== rankMode) {
      const old = prevModeRef.current;
      setOutgoingMode(old);
      prevModeRef.current = rankMode;
      const t = setTimeout(() => setOutgoingMode(null), 400);
      return () => clearTimeout(t);
    }
  }, [rankMode]);
  // 마퀴 통일 속도 — 트랙 width 측정해서 px/s 기준 duration 계산
  const marqueeTrackRef = useRef<HTMLDivElement>(null);
  const [marqueeDuration, setMarqueeDuration] = useState(12);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const responses = await Promise.all([
          fetch('/api/score-ranking'),
          fetch('/api/wealth-ranking'),
          fetch('/api/trade-highlights'),
          fetch('/api/most-traded-apts'),
          fetch('/api/today-activity'),
          fetch('/api/top-quality-awards'),
          fetch('/api/today-sells'),
          fetch('/api/active-offers'),
          fetch('/api/recent-hotdeals'),
        ]);
        const [r1, r2, r3, r4, r5, r6, r7, r8, r9] = responses;
        if (r1.ok) {
          const j = (await r1.json()) as { ranking: RankRow[] };
          if (!cancelled) setRanking(j.ranking ?? []);
        }
        if (r2.ok) {
          const j = (await r2.json()) as { ranking: WealthRow[] };
          if (!cancelled) setWealthRanking(j.ranking ?? []);
        }
        if (r3.ok) {
          const j = (await r3.json()) as { trades: TradeHighlight[] };
          if (!cancelled) setTradeHighlights((j.trades ?? []).map((t) => ({ ...t, deal_amount: Number(t.deal_amount) })));
        }
        if (r4.ok) {
          const j = (await r4.json()) as { apts: TradedApt[] };
          if (!cancelled) setHotApts((j.apts ?? []).map((a) => ({ ...a, trade_count: Number(a.trade_count), median_amount: Number(a.median_amount) })));
        }
        if (r5.ok) {
          const j = (await r5.json()) as { stats: ActivityStats | null };
          if (!cancelled) setActivityStats(j.stats);
        }
        if (r6.ok) {
          const j = (await r6.json()) as { items: QualityAward[] };
          if (!cancelled) setQualityAwards((j.items ?? []).map((q) => ({ ...q, earned: Number(q.earned), multiplier: Number(q.multiplier) })));
        }
        if (r7.ok) {
          const j = (await r7.json()) as { sells: SellEvent[] };
          if (!cancelled) setTodaySells((j.sells ?? []).map((s) => ({ ...s, price: Number(s.price) })));
        }
        if (r8.ok) {
          const j = (await r8.json()) as { offers: ActiveOffer[] };
          if (!cancelled) setActiveOffers((j.offers ?? []).map((o) => ({ ...o, price: Number(o.price) })));
        }
        if (r9.ok) {
          const j = (await r9.json()) as { items: HotdealItem[] };
          if (!cancelled) setRecentHotdeals(j.items ?? []);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);
  // 8초마다 모드 자동 토글 — 데이터 없는 모드는 자동 건너뜀
  // 흥미로운 거래·이벤트 우선 (offers/sells/quality/hot deals → 일반 랭킹)
  useEffect(() => {
    const order: RankMode[] = ['offers', 'sells', 'hotdeals', 'quality', 'activity', 'trade', 'hot', 'score', 'wealth'];
    function hasData(m: RankMode): boolean {
      if (m === 'score') return ranking.length > 0;
      if (m === 'wealth') return wealthRanking.length > 0;
      if (m === 'trade') return tradeHighlights.length > 0;
      if (m === 'hot') return hotApts.length > 0;
      if (m === 'activity') return !!activityStats;
      if (m === 'quality') return qualityAwards.length > 0;
      if (m === 'sells') return todaySells.length > 0;
      if (m === 'offers') return activeOffers.length > 0;
      if (m === 'hotdeals') return recentHotdeals.length > 0;
      return false;
    }
    const t = setInterval(() => {
      setRankMode((m) => {
        const idx = order.indexOf(m);
        for (let i = 1; i <= order.length; i++) {
          const next = order[(idx + i) % order.length];
          if (hasData(next)) return next;
        }
        return m;
      });
    }, 8000);
    return () => clearInterval(t);
  }, [ranking.length, wealthRanking.length, tradeHighlights.length, hotApts.length, activityStats, qualityAwards.length, todaySells.length, activeOffers.length, recentHotdeals.length]);

  // 마퀴 트랙 width 측정 — 모드/데이터 변경 시 재계산
  // 동일한 px/s 속도(=120px/s) 적용 → 모드 무관 같은 체감 속도
  useEffect(() => {
    const el = marqueeTrackRef.current;
    if (!el) return;
    // 다음 frame 에 측정 (DOM 반영 후)
    const id = requestAnimationFrame(() => {
      // scrollWidth 는 두 카피 합계. 절반(=한 사이클) 만 이동하니 그 절반 기준.
      const halfWidth = el.scrollWidth / 2;
      if (halfWidth <= 0) return;
      const PX_PER_SEC = 120;
      const dur = Math.max(8, halfWidth / PX_PER_SEC);
      setMarqueeDuration(dur);
    });
    return () => cancelAnimationFrame(id);
  }, [rankMode, ranking, wealthRanking, tradeHighlights, hotApts, activityStats, qualityAwards, todaySells, activeOffers, recentHotdeals]);

  // outgoing 모드 콘텐츠 렌더 (밀려나가는 트랙용 — 이미 렌더된 jsx 와 동일하면 좋지만 분리되어서 함수로 추출)
  function renderMarqueeItems(mode: RankMode, copy: number): React.ReactNode {
    if (mode === 'score') return ranking.map((r, i) => (
      <span key={`s-${copy}-${r.user_id}`} className="flex-shrink-0">
        <span className="text-yellow-300 font-bold">{i + 1}위</span>{' '}
        <span className="text-white font-bold">{r.display_name}</span>
        <span className="text-cyan"> {r.score}</span>
      </span>
    ));
    if (mode === 'wealth') return wealthRanking.map((w, i) => (
      <span key={`w-${copy}-${w.user_id}`} className="flex-shrink-0">
        <span className="text-[#fbcfe8] font-bold">{i + 1}위</span>{' '}
        <span className="text-white font-bold">{w.display_name}</span>
        <span className="text-cyan"> {Number(w.total_wealth).toLocaleString()} mlbg</span>
        {w.apt_count > 0 && <span className="text-white/60 text-[10px]"> ({w.apt_count}주택)</span>}
      </span>
    ));
    if (mode === 'trade') return tradeHighlights.map((t, i) => (
      <span key={`t-${copy}-${i}`} className="flex-shrink-0">
        <span className="text-[#86efac] font-bold">{t.apt_nm}</span>
        <span className="text-white/70"> {Number(t.excl_use_ar).toFixed(0)}㎡</span>
        <span className="text-white font-bold"> {fmtKRW(Number(t.deal_amount))}</span>
        <span className="text-white/50 text-[10px]"> ({t.deal_date.slice(5).replace('-', '/')})</span>
      </span>
    ));
    if (mode === 'hot') return hotApts.map((a, i) => (
      <span key={`h-${copy}-${i}`} className="flex-shrink-0">
        <span className="text-[#fdba74] font-bold">{i + 1}위</span>{' '}
        <span className="text-white font-bold">{a.apt_nm}</span>
        <span className="text-cyan"> {a.trade_count}건</span>
        <span className="text-white/60 text-[10px]"> 중앙 {fmtKRW(Number(a.median_amount))}</span>
      </span>
    ));
    if (mode === 'activity' && activityStats) return [
      { label: '커뮤글', n: activityStats.posts_today },
      { label: '단지글', n: activityStats.apt_posts_today },
      { label: '커뮤댓글', n: activityStats.comments_today },
      { label: '단지댓글', n: activityStats.apt_comments_today },
      { label: '신규가입', n: activityStats.new_users_today },
      { label: '출석', n: activityStats.checkins_today },
      { label: '신규분양', n: activityStats.claims_today },
    ].map((s, i) => (
      <span key={`a-${copy}-${i}`} className="flex-shrink-0">
        <span className="text-[#bae6fd] font-bold">{s.label}</span>
        <span className="text-white font-bold"> {Number(s.n).toLocaleString()}</span>
        <span className="text-white/50 text-[10px]"> 건</span>
      </span>
    ));
    if (mode === 'quality') return qualityAwards.map((q, i) => (
      <span key={`q-${copy}-${i}`} className="flex-shrink-0">
        <span className="text-[#fde68a] font-bold">{q.author_name ?? '?'}</span>
        {q.apt_nm && <span className="text-white/70"> [{q.apt_nm}]</span>}
        <span className="text-white"> {(q.title ?? '').slice(0, 40)}</span>
        <span className="text-cyan font-bold"> +{q.earned} mlbg</span>
        <span className="text-[#fde68a] text-[10px]"> ({q.multiplier}x)</span>
      </span>
    ));
    if (mode === 'sells') return todaySells.map((s, i) => (
      <span key={`sl-${copy}-${i}`} className="flex-shrink-0">
        <span className="text-[#a7f3d0] font-bold">{s.apt_nm ?? '?'}</span>
        <span className="text-white/70"> {s.seller_name ?? ''} → </span>
        <span className="text-white font-bold">{s.buyer_name ?? ''}</span>
        <span className="text-cyan"> {Number(s.price).toLocaleString()} mlbg</span>
      </span>
    ));
    if (mode === 'offers') return activeOffers.map((o, i) => (
      <span key={`of-${copy}-${i}`} className="flex-shrink-0">
        <span className={`font-bold text-[10px] tracking-wider px-1 py-px ${o.kind === 'snatch' ? 'bg-red-500 text-white' : 'bg-cyan text-white'}`}>{o.kind === 'snatch' ? '내놔' : '매수'}</span>
        <span className="text-[#fda4af] font-bold"> {o.apt_nm ?? '?'}</span>
        <span className="text-white/70"> by </span>
        <span className="text-white font-bold">{o.buyer_name ?? ''}</span>
        <span className="text-cyan"> {o.kind === 'snatch' ? '0 mlbg' : `${Number(o.price).toLocaleString()} mlbg`}</span>
      </span>
    ));
    if (mode === 'hotdeals') return recentHotdeals.map((h, i) => (
      <span key={`hd-${copy}-${i}`} className="flex-shrink-0">
        <span className="text-[#fed7aa] font-bold">[핫딜]</span>{' '}
        <span className="text-white">{h.author_name ?? ''}</span>
        <span className="text-white/70">: </span>
        <span className="text-white">{(h.title ?? '').slice(0, 50)}</span>
      </span>
    ));
    return null;
  }

  // 만원 단위 → 표시
  function fmtKRW(만원: number): string {
    if (만원 >= 10000) {
      const 억 = Math.floor(만원 / 10000);
      const 만 = 만원 % 10000;
      return 만 > 0 ? `${억}억${만.toLocaleString()}` : `${억}억`;
    }
    return `${만원.toLocaleString()}만`;
  }

  // 피드 (단지별 글 최신순). 기본 펼침.
  const [feedOpen, setFeedOpen] = useState(true);
  function jumpToFeedItem(item: FeedItem) {
    // 경매 / 입찰 → /auctions/{id}
    if ((item.kind === 'auction' || item.kind === 'auction_bid') && item.auction_id) {
      router.push(`/auctions/${item.auction_id}`);
      return;
    }
    // 이마트 분양 / 댓글 → 지도 이동 + EmartPanel 열기
    if (item.kind === 'emart_occupy' || item.kind === 'emart_comment') {
      const e = emartList.find((x) => x.id === item.apt_master_id);
      if (item.lat != null && item.lng != null && mapInstRef.current) {
        const inst = mapInstRef.current;
        inst.setLevel(3);
        inst.panTo(new window.kakao.maps.LatLng(item.lat, item.lng));
      }
      if (e) setSelectedEmart(e);
      return;
    }
    // 공장 분양 / 댓글 → 지도 이동 + FactoryPanel 열기
    if (item.kind === 'factory_occupy' || item.kind === 'factory_comment') {
      const f = factoryList.find((x) => x.id === item.apt_master_id);
      if (item.lat != null && item.lng != null && mapInstRef.current) {
        const inst = mapInstRef.current;
        inst.setLevel(3);
        inst.panTo(new window.kakao.maps.LatLng(item.lat, item.lng));
      }
      if (f) setSelectedFactory(f);
      return;
    }
    // 커뮤니티 글/댓글 → /community/{post_id} 로 이동
    if ((item.kind === 'post' || item.kind === 'post_comment') && item.post_id) {
      router.push(`/community/${item.post_id}`);
      return;
    }
    // 아파트 토론/댓글/매물 → 지도 + 단지 패널
    if (item.lat == null || item.lng == null) return;
    const inst = mapInstRef.current;
    if (inst) {
      const ll = new window.kakao.maps.LatLng(item.lat, item.lng);
      inst.setLevel(2);
      inst.panTo(ll);
    }
    const pin = pins.find((p) => p.id === item.apt_master_id);
    if (pin) setSelected(pin);
  }
  function feedRelTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return '방금';
    if (m < 60) return `${m}분`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간`;
    const d = Math.floor(h / 24);
    return `${d}일`;
  }

  // 점거 시간: 24시간 이내면 분/시간, 그 이후는 KST 날짜 (M.D)
  function occupiedSinceLabel(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const ms = Date.now() - d.getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })
      .formatToParts(d).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    return `${parts.month}.${parts.day}`;
  }

  const occupied = useMemo(
    () => pins.filter((p) => p.occupier_id).sort((a, b) => {
      const at = a.occupied_at ? new Date(a.occupied_at).getTime() : 0;
      const bt = b.occupied_at ? new Date(b.occupied_at).getTime() : 0;
      return bt - at; // 최신 점거 먼저
    }),
    [pins],
  );

  // KST 기준 오늘 00:00 (UTC ISO)
  function todayKstStartUtcIso(): string {
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y = kstNow.getUTCFullYear(), m = kstNow.getUTCMonth(), d = kstNow.getUTCDate();
    const kstMidnightUtc = Date.UTC(y, m, d) - 9 * 60 * 60 * 1000;
    return new Date(kstMidnightUtc).toISOString();
  }

  // 카운트 미리 fetch — '오늘의 매매' 폐지. 현재 등록된 매물 갯수.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('apt_listings')
      .select('apt_id', { count: 'exact', head: true })
      .then(({ count }) => setEvictCount(count ?? 0));
  }, [pins]);

  async function toggleEvicts() {
    if (evictsOpen) { setEvictsOpen(false); return; }
    setEvictsOpen(true);
    const supabase = createClient();
    // 매물 리스트 — 매도인 닉네임 + 호가 + 설명 (description 컬럼 없으면 fallback)
    let rawData: unknown[] | null = null;
    const primary = await supabase
      .from('apt_listings')
      .select('apt_id, seller_id, price, listed_at, description, apt_master(apt_nm, dong, lat, lng)')
      .order('listed_at', { ascending: false });
    if (primary.data) {
      rawData = primary.data as unknown[];
    } else {
      const fb = await supabase
        .from('apt_listings')
        .select('apt_id, seller_id, price, listed_at, apt_master(apt_nm, dong, lat, lng)')
        .order('listed_at', { ascending: false });
      rawData = (fb.data ?? null) as unknown[] | null;
    }
    const rawList = (rawData ?? []) as Array<Record<string, unknown>>;

    // 매도인 닉네임 일괄 조회
    const sellerIds = Array.from(new Set(rawList.map((r) => r.seller_id as string).filter(Boolean)));
    const sellerMap = new Map<string, string>();
    if (sellerIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', sellerIds);
      for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name) sellerMap.set(p.id, p.display_name);
      }
    }
    const list: EvictEvent[] = rawList.map((r) => {
      const am = r.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
      return {
        occurred_at: r.listed_at as string,
        actor_name: sellerMap.get(r.seller_id as string) ?? '익명',
        prev_occupier_name: (r.description as string | null) ?? null, // 설명 재활용 (UI 에서 description 으로 표시)
        actor_score: r.price == null ? null : Number(r.price),         // 호가
        apt_id: r.apt_id as number,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
      };
    });
    setEvicts(list);
  }

  function jumpToEvict(e: EvictEvent) {
    if (e.lat == null || e.lng == null) return;
    const inst = mapInstRef.current;
    if (inst) {
      const ll = new window.kakao.maps.LatLng(e.lat, e.lng);
      inst.setLevel(2);
      inst.panTo(ll);
    }
    const pin = pins.find((p) => p.id === e.apt_id);
    if (pin) setSelected(pin);
    setEvictsOpen(false);
  }

  async function toggleOccupied() {
    if (occupiedOpen) { setOccupiedOpen(false); return; }
    setOccupiedOpen(true);
    // 매번 fresh fetch — 점거 변동 즉시 반영
    const ids = Array.from(new Set(occupied.map((p) => p.occupier_id).filter(Boolean) as string[]));
    if (ids.length === 0) return;
    const supabase = createClient();
    const { data } = await supabase.from('profiles').select('id, display_name, link_url, tier, tier_expires_at, is_solo, avatar_url').in('id', ids);
    const map = new Map<string, { name: string; link: string | null; isPaid: boolean; isSolo: boolean; avatarUrl: string | null; aptCount: number | null }>();
    const now = Date.now();
    for (const r of (data ?? []) as Array<{ id: string; display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; avatar_url: string | null; apt_count: number | null }>) {
      if (r.display_name) {
        const isPaid = r.tier === 'paid' && (!r.tier_expires_at || new Date(r.tier_expires_at).getTime() > now);
        map.set(r.id, { name: r.display_name, link: r.link_url, isPaid, isSolo: !!r.is_solo, avatarUrl: r.avatar_url, aptCount: r.apt_count });
      }
    }
    setOccupierProfiles(map);
  }

  // textarea 자동 높이 조절 — 위쪽으로 늘어남 (bottom-anchored)
  useEffect(() => {
    if (aiTextareaRef.current) {
      aiTextareaRef.current.style.height = 'auto';
      aiTextareaRef.current.style.height = `${Math.min(aiTextareaRef.current.scrollHeight, 240)}px`;
    }
  }, [aiQuery]);

  async function submitAi() {
    const q = aiQuery.trim();
    if (!q) return;
    // 점거 게이팅 — 비로그인/비점거자는 차단
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('로그인 후 단지를 점거해야 사용 가능합니다.');
      router.push('/login?next=/');
      return;
    }
    const { count: occCount } = await supabase
      .from('apt_master')
      .select('id', { count: 'exact', head: true })
      .eq('occupier_id', user.id);
    if (!occCount || occCount === 0) {
      alert('단지를 점거해야 사용 가능합니다. 지도에서 단지를 클릭해 글을 1개 이상 쓴 뒤 점거해주세요.');
      return;
    }
    router.push(`/ai?q=${encodeURIComponent(q)}&auto=1`);
  }

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

  // 1) 지도 init — 한 번만. pins 변경 시 재생성하지 않음 (router.refresh로 인한 리셋 방지).
  useEffect(() => {
    if (!KAKAO_KEY) { setError('NEXT_PUBLIC_KAKAO_MAP_KEY 누락'); return; }
    let cancelled = false;

    loadKakaoSdk()
      .then(() => {
        if (cancelled || !mapRef.current || mapInstRef.current) return;
        // 초기 중심 — URL 에 ?lat=&lng= 가 있으면 그 위치로 (디테일 페이지 → 지도 핀 흐름).
        // 없으면 강남 일대 default. 이로써 apt 핀 클릭 시 '강남 1초 flash' 차단.
        const urlLat = Number(searchParams.get('lat'));
        const urlLng = Number(searchParams.get('lng'));
        const hasUrlCoords = Number.isFinite(urlLat) && Number.isFinite(urlLng) && urlLat !== 0 && urlLng !== 0;
        const center = hasUrlCoords
          ? new window.kakao.maps.LatLng(urlLat, urlLng)
          : new window.kakao.maps.LatLng(37.498, 127.027);
        const initialLevel = hasUrlCoords ? 4 : 6;
        const map = new window.kakao.maps.Map(mapRef.current, { center, level: initialLevel }) as KakaoMapInst;
        mapInstRef.current = map;

        // tier 기반 노출.
        // 모바일은 화면이 좁아 더 줌아웃 상태로 보는 경향 → 한 단계 더 관대하게.
        // tier 0 (≥2000세대): 항상 노출
        // tier 1 (1000~1999): 데스크톱 lvl ≤ 5 / 모바일 lvl ≤ 7 (4km 줌에서도 보임)
        // tier 2 (300~999):   데스크톱 lvl ≤ 4 / 모바일 lvl ≤ 5
        // tier 3 (<300):      lvl ≤ 4 (양쪽 동일)
        // 점거/매물 핀은 tier 무관 항상 노출 (게임 정보)
        function tierFor(hh: number): 0 | 1 | 2 | 3 {
          return hh >= 2000 ? 0 : hh >= 1000 ? 1 : hh >= 300 ? 2 : 3;
        }
        function isVisibleForTier(tier: number, lvl: number, occupied: boolean, listed: boolean, hh: number): boolean {
          if (occupied || listed) return true;
          const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
          if (tier === 0) {
            // 주황 (2000~2999): PC 에서 1KM 이상 줌아웃 시 숨김 — 빨강(3000+) 만 노출
            // Kakao 최신 SDK: lvl 5=500m, lvl 6=1KM, lvl 7=2KM. 따라서 lvl >= 6 부터 hide.
            if (!isMobile && lvl >= 6 && hh < 3000) return false;
            return true;
          }
          if (tier === 1) return lvl <= (isMobile ? 7 : 5);
          if (tier === 2) return lvl <= (isMobile ? 5 : 4);
          if (tier === 3) return lvl <= 4;
          return false;
        }
        const updateVisibility = () => {
          const lvl = map.getLevel();
          // 평당가 라벨 — level <= 3 모두 / 4 는 hh>=300. lazy create 로 DOM 폭주 방지.
          const labelLevelOk = lvl <= 4;
          for (const e of markersRef.current) {
            const tier = tierFor(e.hh);
            const v = isVisibleForTier(tier, lvl, e.occupied, e.listed, e.hh);
            e.marker.setMap(v ? map : null);

            if (!e.pyeongPrice || !labelLevelOk || !v) {
              if (e.overlay) e.overlay.setMap(null);
              continue;
            }
            const sizeOk = lvl <= 3 || (lvl === 4 && e.hh >= 300);
            if (!sizeOk) {
              if (e.overlay) e.overlay.setMap(null);
              continue;
            }
            if (!e.overlay) {
              e.overlay = new window.kakao.maps.CustomOverlay({
                position: e.pos,
                content: `<div class="apt-pyeong-label">${e.pyeongPrice >= 10000 ? `${(e.pyeongPrice / 10000).toFixed(1)}억/평` : `${e.pyeongPrice.toLocaleString()}만/평`}</div>`,
                yAnchor: 2.4,
                zIndex: 3,
                clickable: false,
              }) as KakaoOverlayInst;
            }
            e.overlay.setMap(map);
          }
        };
        window.kakao.maps.event.addListener(map, 'zoom_changed', updateVisibility);
        window.addEventListener('mlbg-markers-updated', updateVisibility);

        setMapReady(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 이마트 — 발견 + 렌더 (어느 줌 레벨이든 항상 표시)
  useEffect(() => {
    if (!mapReady || !mapInstRef.current) return;
    const map = mapInstRef.current;
    let cancelled = false;

    // 발견 — sessionStorage 로 1회만 (page 새로고침 시 한 번)
    const discoveryKey = 'mlbg_emart_discovered_v1';
    async function discover() {
      if (typeof window === 'undefined') return;
      if (sessionStorage.getItem(discoveryKey)) return;
      try {
        const ps = new window.kakao.maps.services.Places();
        // 서울 + 인접 — 약 45건씩 3 페이지 = 최대 135건
        const supabase = createClient();
        const seen = new Set<string>();
        for (let page = 1; page <= 3; page++) {
          await new Promise<void>((resolve) => {
            ps.keywordSearch('이마트', async (data, status) => {
              if (cancelled) { resolve(); return; }
              if (status !== window.kakao.maps.services.Status.OK) { resolve(); return; }
              for (const r of data) {
                if (seen.has(r.id)) continue;
                seen.add(r.id);
                const lng = Number(r.x); const lat = Number(r.y);
                // 수도권 영역 필터 (대략)
                if (lat < 37.0 || lat > 38.0 || lng < 126.5 || lng > 127.7) continue;
                if (!/이마트/.test(r.place_name)) continue;
                await supabase.rpc('upsert_emart_location', {
                  p_kakao_place_id: r.id,
                  p_name: r.place_name,
                  p_address: r.road_address_name || r.address_name || '',
                  p_lat: lat,
                  p_lng: lng,
                }).then((x) => x, () => null);
              }
              resolve();
            }, { page, size: 15 });
          });
        }
        sessionStorage.setItem(discoveryKey, '1');
      } catch { /* silent */ }
    }

    (async () => {
      await refetchEmart();
      // discovery 비동기 — 끝나면 다시 fetch
      void (async () => {
        await discover();
        if (!cancelled) await refetchEmart();
      })();
    })();

    // 마커 렌더는 emartList useEffect 에서 별도 처리
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // 이마트 마커 렌더 — emartList 변경 시 갱신
  useEffect(() => {
    if (!mapReady || !mapInstRef.current) return;
    const map = mapInstRef.current;
    // 기존 마커 제거
    for (const m of emartMarkersRef.current) m.setMap(null);
    emartMarkersRef.current = [];

    if (emartList.length === 0) return;
    // 물방울 모양 (32x45) — bottom 정점에 anchor
    const PIN_W = 32, PIN_H = 45;
    const img = new window.kakao.maps.MarkerImage(
      '/pins/emart.svg',
      new window.kakao.maps.Size(PIN_W, PIN_H),
      { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) },
    );
    for (const e of emartList) {
      const pos = new window.kakao.maps.LatLng(e.lat, e.lng);
      const marker = new window.kakao.maps.Marker({
        position: pos,
        title: e.occupier_id ? `${e.name} — ${e.occupier_name ?? '점거됨'} 보유` : `${e.name} (5 mlbg 분양 가능)`,
        clickable: true,
        image: img,
        map,
      }) as KakaoMarkerInst;
      window.kakao.maps.event.addListener(marker, 'click', () => {
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          router.push(`/e/${e.id}`);
        } else {
          setSelectedEmart(e);
        }
      });
      emartMarkersRef.current.push(marker);
    }
    return () => {
      for (const m of emartMarkersRef.current) m.setMap(null);
      emartMarkersRef.current = [];
    };
  }, [emartList, mapReady]);

  // 이마트 일일 수익 청구
  const [emartCurrentUid, setEmartCurrentUid] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmartCurrentUid(data?.user?.id ?? null), () => {});
  }, []);

  async function claimEmartIncome() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('claim_emart_income');
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_earned: number; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '청구 실패'); return; }
    alert(`+${row.out_earned} mlbg 수익 청구 완료.`);
    setSelectedEmart(null);
    await refetchEmart();
    router.refresh();
  }

  // 이마트 점거 액션
  async function occupyEmart(emart: EmartItem) {
    if (emart.occupier_id) { alert(`이미 ${emart.occupier_name ?? '다른 사람'} 님이 보유 중`); return; }
    if (!confirm(`${emart.name}\n5 mlbg 로 분양받습니다. (1인 1점포 — 다른 이마트 보유 시 거절됨)`)) return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc('occupy_emart', { p_emart_id: emart.id });
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '분양 실패'); return; }
    alert(`${emart.name} 분양 완료. 5 mlbg 차감됨.`);
    // 텔레그램 자동 알림 — fire-and-forget
    notifyTelegram('emart_occupy', emart.id);
    setSelectedEmart(null);
    await refetchEmart();
    router.refresh();
  }

  // 2) 마커 갱신 — pins 변경 시 기존 제거 후 재생성. 지도 view는 그대로.
  // 1만개 마커 생성을 setTimeout 으로 청크 분할 → 메인 스레드 차단 최소화.
  useEffect(() => {
    if (!mapReady || !mapInstRef.current) return;
    if (pins.length === 0) return;
    const map = mapInstRef.current;

    // 기존 마커·오버레이 제거 (entry 안의 overlay 도 같이)
    for (const e of markersRef.current) {
      e.marker.setMap(null);
      if (e.overlay) e.overlay.setMap(null);
    }
    markersRef.current = [];
    overlaysRef.current = [];

    function formatPyeong(p: number): string {
      if (p >= 10000) return `${(p / 10000).toFixed(1)}억/평`;
      return `${p.toLocaleString()}만/평`;
    }

    const PIN_W = 32, PIN_H = 45;
    const makeImg = (color: string, occ: boolean, listed: boolean = false) => new window.kakao.maps.MarkerImage(
      buildPinSvg(color, occ, listed),
      new window.kakao.maps.Size(PIN_W, PIN_H),
      { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) },
    );
    const pins8 = {
      red: {
        plain: makeImg(PIN_COLORS.red, false), occ: makeImg(PIN_COLORS.red, true),
        listedPlain: makeImg(PIN_COLORS.red, false, true), listedOcc: makeImg(PIN_COLORS.red, true, true),
      },
      orange: {
        plain: makeImg(PIN_COLORS.orange, false), occ: makeImg(PIN_COLORS.orange, true),
        listedPlain: makeImg(PIN_COLORS.orange, false, true), listedOcc: makeImg(PIN_COLORS.orange, true, true),
      },
      green: {
        plain: makeImg(PIN_COLORS.green, false), occ: makeImg(PIN_COLORS.green, true),
        listedPlain: makeImg(PIN_COLORS.green, false, true), listedOcc: makeImg(PIN_COLORS.green, true, true),
      },
      blue: {
        plain: makeImg(PIN_COLORS.blue, false), occ: makeImg(PIN_COLORS.blue, true),
        listedPlain: makeImg(PIN_COLORS.blue, false, true), listedOcc: makeImg(PIN_COLORS.blue, true, true),
      },
    };
    const dotBlue = new window.kakao.maps.MarkerImage(
      '/pins/blue_dot.svg',
      new window.kakao.maps.Size(20, 20),
      { offset: new window.kakao.maps.Point(10, 10) },
    );

    function pickPin(hh: number | null, occupied: boolean, listed: boolean) {
      if (hh === null) return dotBlue;
      const t = hh >= 3000 ? 'red' : hh >= 2000 ? 'orange' : hh >= 1000 ? 'green' : hh >= 300 ? 'blue' : null;
      if (!t) return dotBlue;
      if (listed) return occupied ? pins8[t].listedOcc : pins8[t].listedPlain;
      return occupied ? pins8[t].occ : pins8[t].plain;
    }

    const allMarkers: MarkerEntry[] = [];
    let cancelled = false;

    // 우선순위 정렬: 큰 단지·점거 단지 먼저 → 화면에 중요한 핀이 100ms 내 등장.
    // 작은 단지는 뒤에서 천천히. 청크 사이즈 2000 으로 키워 yield 오버헤드 절감.
    const sorted = [...pins].sort((a, b) => {
      const aOcc = a.occupier_id ? 1 : 0;
      const bOcc = b.occupier_id ? 1 : 0;
      if (aOcc !== bOcc) return bOcc - aOcc; // 점거 우선
      return (b.household_count ?? 0) - (a.household_count ?? 0); // 큰 단지 우선
    });

    const CHUNK = 2000;
    let i = 0;
    function processChunk() {
      if (cancelled) return;
      const end = Math.min(i + CHUNK, sorted.length);
      for (; i < end; i++) {
        const p = sorted[i];
        const pos = new window.kakao.maps.LatLng(p.lat, p.lng);
        const hh = p.household_count ?? 0;
        const occupied = !!p.occupier_id;
        const listed = p.listing_price != null;
        const marker = new window.kakao.maps.Marker({
          position: pos,
          title: listed ? `${p.apt_nm} — 매물 ${Number(p.listing_price).toLocaleString()} mlbg` : p.apt_nm,
          clickable: true,
          image: pickPin(p.household_count, occupied, listed),
          // 일단 숨김 — updateVisibility 가 viewport 안 + cap 안에 들면 노출
        }) as KakaoMarkerInst;
        window.kakao.maps.event.addListener(marker, 'click', () => {
          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            router.push(`/apt/${p.id}`);
          } else {
            setSelected(p);
          }
        });

        // 오버레이는 lazy 생성 — 줌 레벨이 라벨 노출 임계 도달했을 때만 createCustomOverlay.
        // DOM 수천개 영구 생성 방지. updateVisibility() 안에서 처리됨.
        const pyeongPrice = (p.pyeong_price && p.pyeong_price > 0) ? Number(p.pyeong_price) : null;
        allMarkers.push({ marker, overlay: null, pyeongPrice, pos, lat: p.lat, lng: p.lng, hh, occupied, listed });
      }
      markersRef.current = allMarkers;
      // 첫 chunk (큰 단지·점거·매물 우선순위) 끝나면 한 번 노출, 그 이후는 마지막 chunk 끝에서만.
      // 매 chunk 마다 dispatching 하면 수만개 setMap 호출 누적 → pan 끊김.
      if (i < sorted.length) {
        if (i === Math.min(CHUNK, sorted.length)) {
          window.dispatchEvent(new Event('mlbg-markers-updated'));
        }
        setTimeout(processChunk, 0);
      } else {
        window.dispatchEvent(new Event('mlbg-markers-updated'));
      }
    }
    processChunk();

    return () => { cancelled = true; };
  }, [pins, mapReady]);

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

      {/* 상단 전광판 — 9종 데이터 8초 토글 (데이터 없으면 자동 skip) */}
      {(() => {
        const has = (m: RankMode): boolean => {
          if (m === 'score') return ranking.length > 0;
          if (m === 'wealth') return wealthRanking.length > 0;
          if (m === 'trade') return tradeHighlights.length > 0;
          if (m === 'hot') return hotApts.length > 0;
          if (m === 'activity') return !!activityStats;
          if (m === 'quality') return qualityAwards.length > 0;
          if (m === 'sells') return todaySells.length > 0;
          if (m === 'offers') return activeOffers.length > 0;
          if (m === 'hotdeals') return recentHotdeals.length > 0;
          return false;
        };
        return has(rankMode);
      })() && (
        <div className="absolute top-4 left-[300px] right-4 z-20 bg-black border border-black shadow-[0_2px_8px_rgba(0,0,0,0.4)] px-3 py-2 text-[12px] flex items-center gap-3 tabular-nums tracking-wide">
          <button
            type="button"
            onClick={() => {
              const order: RankMode[] = ['offers', 'sells', 'hotdeals', 'quality', 'activity', 'trade', 'hot', 'score', 'wealth'];
              setRankMode((m) => order[(order.indexOf(m) + 1) % order.length]);
            }}
            className="font-bold flex-shrink-0 bg-transparent border-none p-0 cursor-pointer"
            title="클릭하면 다음 모드로"
          >
            {rankMode === 'score' && <span className="text-yellow-300 [text-shadow:0_0_6px_rgba(253,224,71,0.6)]">🏆 스코어</span>}
            {rankMode === 'wealth' && <span className="text-[#fbcfe8] [text-shadow:0_0_6px_rgba(251,207,232,0.6)]">💰 자산</span>}
            {rankMode === 'trade' && <span className="text-[#86efac] [text-shadow:0_0_6px_rgba(134,239,172,0.6)]">📈 실거래</span>}
            {rankMode === 'hot' && <span className="text-[#fdba74] [text-shadow:0_0_6px_rgba(253,186,116,0.6)]">🔥 거래활발</span>}
            {rankMode === 'activity' && <span className="text-[#bae6fd] [text-shadow:0_0_6px_rgba(186,230,253,0.6)]">📊 오늘 활동</span>}
            {rankMode === 'quality' && <span className="text-[#fde68a] [text-shadow:0_0_6px_rgba(253,230,138,0.6)]">⭐ 정성글</span>}
            {rankMode === 'sells' && <span className="text-[#a7f3d0] [text-shadow:0_0_6px_rgba(167,243,208,0.6)]">🤝 오늘 매매</span>}
            {rankMode === 'offers' && <span className="text-[#fda4af] [text-shadow:0_0_6px_rgba(253,164,175,0.6)]">💸 진행중 호가</span>}
            {rankMode === 'hotdeals' && <span className="text-[#fed7aa] [text-shadow:0_0_6px_rgba(254,215,170,0.6)]">🛒 핫딜</span>}
          </button>
          <div className="marquee-mask flex-1 overflow-hidden relative h-[20px]">
            {/* 위로 밀려나가는 직전 모드 (outgoing) */}
            {outgoingMode && (
              <div className="absolute inset-0 marquee-conveyor-out">
                <div className="marquee-track flex w-max" style={{ ['--marquee-duration' as string]: `${marqueeDuration}s`, animationPlayState: 'paused' }}>
                  {[0, 1].map((copy) => (
                    <div key={copy} aria-hidden={copy === 1} className="flex gap-8 pr-8">
                      {renderMarqueeItems(outgoingMode, copy)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 새로 올라오는 현재 모드 (incoming) */}
            <div
              key={rankMode}
              className="absolute inset-0 marquee-conveyor-in"
            >
              <div
                ref={marqueeTrackRef}
                className="marquee-track flex w-max"
                style={{ ['--marquee-duration' as string]: `${marqueeDuration}s` }}
              >
              {[0, 1].map((copy) => (
                <div key={copy} aria-hidden={copy === 1} className="flex gap-8 pr-8">
                  {rankMode === 'score' && ranking.map((r, i) => (
                    <span key={`s-${copy}-${r.user_id}`} className="flex-shrink-0">
                      <span className="text-yellow-300 font-bold">{i + 1}위</span>{' '}
                      <span className="text-white font-bold">{r.display_name}</span>
                      <span className="text-cyan"> {r.score}</span>
                    </span>
                  ))}
                  {rankMode === 'wealth' && wealthRanking.map((w, i) => (
                    <span key={`w-${copy}-${w.user_id}`} className="flex-shrink-0">
                      <span className="text-[#fbcfe8] font-bold">{i + 1}위</span>{' '}
                      <span className="text-white font-bold">{w.display_name}</span>
                      <span className="text-cyan"> {Number(w.total_wealth).toLocaleString()} mlbg</span>
                      {w.apt_count > 0 && <span className="text-white/60 text-[10px]"> ({w.apt_count}주택)</span>}
                    </span>
                  ))}
                  {rankMode === 'trade' && tradeHighlights.map((t, i) => (
                    <span key={`t-${copy}-${i}`} className="flex-shrink-0">
                      <span className="text-[#86efac] font-bold">{t.apt_nm}</span>
                      <span className="text-white/70"> {Number(t.excl_use_ar).toFixed(0)}㎡</span>
                      <span className="text-white font-bold"> {fmtKRW(Number(t.deal_amount))}</span>
                      <span className="text-white/50 text-[10px]"> ({t.deal_date.slice(5).replace('-', '/')})</span>
                    </span>
                  ))}
                  {rankMode === 'hot' && hotApts.map((a, i) => (
                    <span key={`h-${copy}-${i}`} className="flex-shrink-0">
                      <span className="text-[#fdba74] font-bold">{i + 1}위</span>{' '}
                      <span className="text-white font-bold">{a.apt_nm}</span>
                      <span className="text-cyan"> {a.trade_count}건</span>
                      <span className="text-white/60 text-[10px]"> 중앙 {fmtKRW(Number(a.median_amount))}</span>
                    </span>
                  ))}
                  {rankMode === 'activity' && activityStats && (
                    <>
                      {[
                        { label: '커뮤글', n: activityStats.posts_today },
                        { label: '단지글', n: activityStats.apt_posts_today },
                        { label: '커뮤댓글', n: activityStats.comments_today },
                        { label: '단지댓글', n: activityStats.apt_comments_today },
                        { label: '신규가입', n: activityStats.new_users_today },
                        { label: '출석', n: activityStats.checkins_today },
                        { label: '신규분양', n: activityStats.claims_today },
                      ].map((s, i) => (
                        <span key={`a-${copy}-${i}`} className="flex-shrink-0">
                          <span className="text-[#bae6fd] font-bold">{s.label}</span>
                          <span className="text-white font-bold"> {Number(s.n).toLocaleString()}</span>
                          <span className="text-white/50 text-[10px]"> 건</span>
                        </span>
                      ))}
                    </>
                  )}
                  {rankMode === 'quality' && qualityAwards.map((q, i) => (
                    <span key={`q-${copy}-${i}`} className="flex-shrink-0">
                      <span className="text-[#fde68a] font-bold">{q.author_name ?? '?'}</span>
                      {q.apt_nm && <span className="text-white/70"> [{q.apt_nm}]</span>}
                      <span className="text-white"> {(q.title ?? '').slice(0, 40)}</span>
                      <span className="text-cyan font-bold"> +{q.earned} mlbg</span>
                      <span className="text-[#fde68a] text-[10px]"> ({q.multiplier}x)</span>
                    </span>
                  ))}
                  {rankMode === 'sells' && todaySells.map((s, i) => (
                    <span key={`sl-${copy}-${i}`} className="flex-shrink-0">
                      <span className="text-[#a7f3d0] font-bold">{s.apt_nm ?? '?'}</span>
                      <span className="text-white/70"> {s.seller_name ?? ''} → </span>
                      <span className="text-white font-bold">{s.buyer_name ?? ''}</span>
                      <span className="text-cyan"> {Number(s.price).toLocaleString()} mlbg</span>
                    </span>
                  ))}
                  {rankMode === 'offers' && activeOffers.map((o, i) => (
                    <span key={`of-${copy}-${i}`} className="flex-shrink-0">
                      <span className={`font-bold text-[10px] tracking-wider px-1 py-px ${o.kind === 'snatch' ? 'bg-red-500 text-white' : 'bg-cyan text-white'}`}>{o.kind === 'snatch' ? '내놔' : '매수'}</span>
                      <span className="text-[#fda4af] font-bold"> {o.apt_nm ?? '?'}</span>
                      <span className="text-white/70"> by </span>
                      <span className="text-white font-bold">{o.buyer_name ?? ''}</span>
                      <span className="text-cyan"> {o.kind === 'snatch' ? '0 mlbg' : `${Number(o.price).toLocaleString()} mlbg`}</span>
                    </span>
                  ))}
                  {rankMode === 'hotdeals' && recentHotdeals.map((h, i) => (
                    <span key={`hd-${copy}-${i}`} className="flex-shrink-0">
                      <span className="text-[#fed7aa] font-bold">[핫딜]</span>{' '}
                      <span className="text-white">{h.author_name ?? ''}</span>
                      <span className="text-white/70">: </span>
                      <span className="text-white">{(h.title ?? '').slice(0, 50)}</span>
                    </span>
                  ))}
                </div>
              ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 좌상단 — 아파트 검색 + 정보 배지 스택 (화면 좌상단 끝에 딱 붙임) */}
      <div className="absolute top-0 left-0 z-20 flex flex-col w-[280px]">
        <div className="bg-white border-2 border-navy shadow-[0_2px_8px_rgba(0,0,0,0.12)] flex items-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="ml-3 text-muted flex-shrink-0">
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
            placeholder={`아파트 검색 (${pins.length.toLocaleString()}개 단지)`}
            className="flex-1 min-w-0 px-2 py-1.5 text-[12px] focus:outline-none bg-transparent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="지우기"
              className="px-2 py-1 text-muted hover:text-navy text-[12px]"
            >
              ✕
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <ul className="bg-white border border-border shadow-[0_4px_20px_rgba(0,0,0,0.12)] max-h-[280px] overflow-y-auto">
            {searchResults.map((p) => (
              <li
                key={p.id}
                onClick={() => jumpToApt(p)}
                className="px-3 py-2 border-b border-[#f0f0f0] last:border-b-0 cursor-pointer bg-white hover:bg-[#eef4fb]"
              >
                <div className="text-[12px] font-bold text-navy truncate">{p.apt_nm}</div>
                {p.dong && <div className="text-[10px] text-muted truncate">{p.dong}</div>}
              </li>
            ))}
          </ul>
        )}
        {liveAuctions.length > 0 && (
          <Link
            href={liveAuctions.length === 1 ? `/auctions/${liveAuctions[0].id}` : '/auctions'}
            className="bg-[#dc2626] text-white px-3 py-2 shadow-[0_2px_8px_rgba(220,38,38,0.4)] text-[12px] font-bold flex items-center gap-1.5 border border-[#b91c1c] hover:bg-[#b91c1c] no-underline animate-pulse-glow"
          >
            <span className="text-[14px]">🔥</span>
            <span className="font-black tracking-wide">LIVE 경매 {liveAuctions.length}</span>
            <Countdown endsAt={liveAuctions[0].ends_at} className="ml-auto text-[12px] font-black" />
          </Link>
        )}
        <button
          type="button"
          onClick={toggleEvicts}
          className={`px-3 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-[12px] font-bold flex items-center gap-1.5 border ${
            evictCount > 0
              ? 'bg-[#fce7f3] text-[#9d174d] border-[#fbcfe8] hover:bg-[#fbcfe8]'
              : 'bg-white text-navy border-border hover:border-navy'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          <span>매물 : {evictCount}건</span>
          <span className={`ml-auto text-[11px] ${evictCount > 0 ? 'text-[#9d174d]/70' : 'text-muted'}`}>{evictsOpen ? '접기 ^' : '펼치기 v'}</span>
        </button>
        {evictsOpen && (
          <div className="bg-white border border-border shadow-[0_4px_20px_rgba(0,0,0,0.12)] w-full max-h-[60vh] overflow-y-auto">
            {evicts === null ? (
              <div className="px-4 py-6 text-[12px] text-muted text-center">불러오는 중...</div>
            ) : evicts.length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-muted text-center">등록된 매물 없음</div>
            ) : (
              <ul>
                {evicts.map((e, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => jumpToEvict(e)}
                      className="w-full text-left px-4 py-2.5 border-b border-[#f0f0f0] last:border-b-0 bg-white hover:bg-cyan/10 flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-bold text-navy truncate">{e.apt_nm ?? '(단지 정보 없음)'}</div>
                        {e.actor_score != null && (
                          <div className="text-[12px] text-cyan font-bold tabular-nums flex-shrink-0">
                            {Number(e.actor_score).toLocaleString()} mlbg
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] flex items-center gap-1.5">
                        <span className="text-muted">매도</span>
                        <span className="text-text font-medium">{e.actor_name ?? '익명'}</span>
                        <span className="text-muted ml-auto tabular-nums text-[10px]">{occupiedSinceLabel(e.occurred_at)}</span>
                      </div>
                      {e.prev_occupier_name && (
                        <div className="text-[11px] text-muted leading-snug whitespace-pre-wrap mt-0.5 line-clamp-2">
                          {e.prev_occupier_name}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* 피드 — 단지별 글 최신순. 기본 펼침. */}
        <button
          type="button"
          onClick={() => setFeedOpen((v) => !v)}
          className="bg-white border border-border px-3 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-[12px] font-bold text-navy hover:bg-[#eef4fb] hover:border-navy flex items-center gap-1.5"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          <span>피드 : {feed.length}개</span>
          <span className="ml-auto text-[11px] text-muted">{feedOpen ? '접기 ^' : '펼치기 v'}</span>
        </button>
        {feedOpen && (
          <div className="bg-white border border-border shadow-[0_4px_20px_rgba(0,0,0,0.12)] max-h-[60vh] overflow-y-auto">
            {feed.length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-muted text-center">아직 작성된 글 없음</div>
            ) : (
              <ul>
                {feed.map((f) => {
                  const feedKey = `${f.kind}-${f.id}`;
                  const fullContent = (f.content ?? '').trim();
                  const isComment = f.kind === 'comment' || f.kind === 'post_comment';
                  const isCommunity = f.kind === 'post' || f.kind === 'post_comment';
                  const isListing = f.kind === 'listing';
                  const isOffer = f.kind === 'offer';
                  const isSnatch = f.kind === 'snatch';
                  const isAuction = f.kind === 'auction';
                  const isAuctionBid = f.kind === 'auction_bid';
                  const isNotice = f.kind === 'notice';
                  const isEmartOccupy = f.kind === 'emart_occupy';
                  const isFactoryOccupy = f.kind === 'factory_occupy';
                  const isFacilityComment = f.kind === 'emart_comment' || f.kind === 'factory_comment';
                  const headLabel = isNotice ? '분양 공지'
                    : f.kind === 'strike' ? '💥 파업'
                    : f.kind === 'bridge_toll' ? '🌉 다리 통행료'
                    : f.kind === 'sell_complete' ? '🤝 거래성사'
                    : (isEmartOccupy || isFactoryOccupy || isFacilityComment) ? (f.apt_nm ?? '시설')
                    : isCommunity ? '커뮤니티'
                    : (f.apt_nm ?? '(단지 정보 없음)');
                  return (
                    <li key={feedKey} className="border-b border-[#f0f0f0] last:border-b-0">
                      <div className={`px-3 py-2.5 ${
                        isAuction ? 'bg-[#fef2f2] hover:bg-[#fee2e2] border-l-4 border-[#dc2626]' :
                        'bg-white hover:bg-[#fafbfc]'
                      }`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <button
                            type="button"
                            onClick={() => jumpToFeedItem(f)}
                            className="text-[12px] font-bold text-navy truncate hover:underline text-left min-w-0 flex-1 bg-transparent border-none p-0 cursor-pointer"
                          >
                            {headLabel}
                          </button>
                          <span className="text-[10px] text-cyan font-bold flex-shrink-0">
                            <Nickname info={feedItemToNicknameInfo(f)} />
                          </span>
                        </div>
                        {/* 본문 영역 — 클릭 시 jumpToFeedItem 으로 이동 (글로) */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => jumpToFeedItem(f)}
                          onKeyDown={(e) => { if (e.key === 'Enter') jumpToFeedItem(f); }}
                          className="cursor-pointer hover:opacity-80"
                        >
                          {(isEmartOccupy || isFactoryOccupy) ? (
                            <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-[#F5A623] text-white px-1.5 py-0.5 flex-shrink-0 mt-0.5">분양</span>
                              <span className="whitespace-pre-wrap break-words">
                                <b className="text-[#92400e]">{f.title}</b>
                              </span>
                            </div>
                          ) : isFacilityComment ? (
                            <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-cyan/15 text-cyan px-1.5 py-0.5 flex-shrink-0 mt-0.5">댓글</span>
                              <span className="whitespace-pre-wrap break-words">{fullContent ? renderFeedContentWithImages(fullContent) : f.title}</span>
                            </div>
                          ) : isAuctionBid ? (
                            <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-[#dc2626] text-white px-1.5 py-0.5 flex-shrink-0 mt-0.5">입찰</span>
                              <span className="whitespace-pre-wrap break-words">
                                <b className="text-[#dc2626]">{f.title}</b>
                                {f.apt_nm && <span className="text-muted block mt-0.5">{f.apt_nm}</span>}
                              </span>
                            </div>
                          ) : isAuction ? (
                            <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-[#dc2626] text-white px-1.5 py-0.5 flex-shrink-0 mt-0.5 animate-pulse">LIVE</span>
                              <span className="whitespace-pre-wrap break-words flex-1">
                                <b className="text-[#dc2626]">{f.title}</b>
                                {fullContent && <span className="text-muted block mt-0.5">{fullContent}</span>}
                                {f.ends_at && (
                                  <span className="block mt-1 text-[#dc2626] font-black tabular-nums">
                                    종료까지 <Countdown endsAt={f.ends_at} />
                                  </span>
                                )}
                              </span>
                            </div>
                          ) : isComment ? (
                            <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-cyan/15 text-cyan px-1.5 py-0.5 flex-shrink-0 mt-0.5">댓글</span>
                              <span className="whitespace-pre-wrap break-words">{fullContent ? renderFeedContentWithImages(fullContent) : f.title}</span>
                            </div>
                          ) : isListing ? (
                            <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-[#fce7f3] text-[#9d174d] px-1.5 py-0.5 flex-shrink-0 mt-0.5">매물</span>
                              <span className="whitespace-pre-wrap break-words font-medium">{f.title}</span>
                            </div>
                          ) : isOffer ? (
                            <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-navy text-white px-1.5 py-0.5 flex-shrink-0 mt-0.5">매수호가</span>
                              <span className="whitespace-pre-wrap break-words">
                                <b className="text-navy">{f.title}</b>
                                {fullContent && <span className="text-muted block mt-0.5">{fullContent}</span>}
                              </span>
                            </div>
                          ) : isSnatch ? (
                            <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                              <span className="text-[9px] font-bold tracking-wider uppercase bg-red-500 text-white px-1.5 py-0.5 flex-shrink-0 mt-0.5">내놔</span>
                              <span className="whitespace-pre-wrap break-words">
                                <b className="text-red-600">{f.title}</b>
                                {fullContent && <span className="text-muted block mt-0.5">{fullContent}</span>}
                              </span>
                            </div>
                          ) : (
                            <>
                              <div className="text-[12px] text-text leading-snug mb-0.5 break-words">{f.title}</div>
                              {fullContent && (
                                <div className="text-[12px] text-text leading-snug whitespace-pre-wrap break-words">{renderFeedContentWithImages(fullContent)}</div>
                              )}
                            </>
                          )}
                          <div className="text-[10px] text-muted mt-1 flex items-center gap-2">
                            <span>{feedRelTime(f.created_at)} 전</span>
                            {typeof f.earned_mlbg === 'number' && (
                              <RewardTooltip earned={f.earned_mlbg} kind={f.kind === 'discussion' ? 'apt_post' : f.kind === 'comment' ? 'apt_comment' : f.kind === 'post' ? 'community_post' : f.kind === 'post_comment' ? 'community_comment' : f.kind === 'factory_comment' ? 'factory_comment' : f.kind === 'emart_comment' ? 'emart_comment' : undefined} />
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>


      {/* 가운데 하단 — AI 검색 (B 위치). /ai 페이지 디자인과 통일. */}
      <form
        onSubmit={(e) => { e.preventDefault(); submitAi(); }}
        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[520px] max-w-[calc(100vw-200px)] z-20"
      >
        <div className="flex h-[60px] border border-navy bg-white shadow-[0_8px_24px_rgba(0,32,96,0.08),0_2px_6px_rgba(0,0,0,0.04)]">
          <input
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitAi();
              }
            }}
            placeholder="멜른버그AI 에게 질문하기 (mlbg DB기반)"
            className="flex-1 min-w-0 h-full px-5 text-[15px] outline-none bg-transparent border-0 m-0"
          />
          <button
            type="submit"
            aria-label="질문하기"
            className="flex-shrink-0 w-[60px] h-full bg-navy text-white flex items-center justify-center hover:bg-navy-dark disabled:opacity-40 border-0 p-0 m-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted text-center leading-tight">
          입력하신 질문과 답변은 서비스 품질 개선 및 콘텐츠 제작에 활용될 수 있으며, 개인을 식별할 수 있는 정보는 포함되지 않습니다.
        </p>
      </form>


      {/* 우측 하단 범례 — 숨김 (PC 도 깔끔하게) */}
      <div className="hidden absolute bottom-8 right-6 z-20 pointer-events-none">
        <div className="text-[11px] font-bold text-navy mb-1.5 tracking-wider uppercase drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">세대수</div>
        <ul className="space-y-1.5 text-[12px]">
          <li className="flex items-center gap-2">
            <img src={buildPinSvg(PIN_COLORS.red, false)} alt="" className="w-5 h-7 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">3000+ 대단지</span>
          </li>
          <li className="flex items-center gap-2">
            <img src={buildPinSvg(PIN_COLORS.orange, false)} alt="" className="w-5 h-7 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">2000~2999</span>
          </li>
          <li className="flex items-center gap-2">
            <img src={buildPinSvg(PIN_COLORS.green, false)} alt="" className="w-5 h-7 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">1000~1999</span>
          </li>
          <li className="flex items-center gap-2">
            <img src={buildPinSvg(PIN_COLORS.blue, false)} alt="" className="w-5 h-7 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">300~999</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 flex items-center justify-center">
              <span className="inline-block w-3 h-3 rounded-full bg-[#3066BE] border-2 border-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            </span>
            <span className="text-navy font-bold drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">~299 (소단지)</span>
          </li>
        </ul>
      </div>

      {selected && <AptDiscussionPanel apt={selected} onClose={() => setSelected(null)} />}

      {selectedEmart && <EmartPanel emart={selectedEmart} onClose={() => setSelectedEmart(null)} onChanged={refetchEmart} />}
      {selectedFactory && <FactoryPanel factory={selectedFactory} onClose={() => setSelectedFactory(null)} onChanged={refetchFactory} />}
    </div>
  );
}
