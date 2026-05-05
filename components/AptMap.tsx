'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AptDiscussionPanel from './AptDiscussionPanel';
import { createClient } from '@/lib/supabase/client';
import Nickname from './Nickname';

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

export type FeedItem = {
  kind: 'discussion' | 'comment' | 'post' | 'post_comment';
  id: number;
  apt_master_id: number;     // post/post_comment 일 땐 0
  post_id: number | null;    // post: 자기 id / post_comment: 부모 post id / 그 외 null
  title: string;             // discussion: 글 제목 / comment: 부모 글 제목 / post: 글 제목 / post_comment: 부모 글 제목
  content: string | null;
  created_at: string;
  apt_nm: string | null;
  dong: string | null;
  lat: number | null;
  lng: number | null;
  author_name: string | null;
  author_link: string | null;
  author_is_paid: boolean;
  author_is_solo: boolean;
};

export type AptPin = {
  id: number;
  apt_nm: string;
  dong: string | null;
  lat: number;
  lng: number;
  household_count: number | null;
  building_count: number | null;
  kapt_build_year: number | null;
  geocoded_address: string | null;
  occupier_id: string | null;
  occupied_at: string | null;
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

// 핀 색상
const PIN_COLORS = {
  red: '#C8392E',
  orange: '#E8772E',
  green: '#2D7A4F',
  blue: '#3066BE',
};

// 물방울 모양 핀 SVG. 단색 + 광택. 점거 시 흰 삼각 깃발 추가.
function buildPinSvg(color: string, occupied: boolean): string {
  // 깃발: 흰색 + 검정 테두리. 사이즈 20% 축소.
  // 깃대: 검정 outer + 흰 inner (테두리 효과). 삼각: 흰 fill + 검정 stroke.
  const flag = occupied
    ? '<line x1="11" y1="7.5" x2="11" y2="24.5" stroke="#1a1d22" stroke-width="3.6" stroke-linecap="round"/><line x1="11" y1="8" x2="11" y2="24" stroke="white" stroke-width="2.2" stroke-linecap="round"/><polygon points="11,8 23,13 11,18" fill="white" stroke="#1a1d22" stroke-width="0.9" stroke-linejoin="round"/>'
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="45" viewBox="0 0 32 45">
<defs><radialGradient id="g" cx="35%" cy="30%" r="60%"><stop offset="0%" stop-color="white" stop-opacity="0.55"/><stop offset="60%" stop-color="white" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="16" cy="42" rx="6.5" ry="2" fill="rgba(0,0,0,0.22)"/>
<path d="M16 1.5 C 7 1.5, 2 8, 2 17 C 2 28, 16 41.5, 16 41.5 C 16 41.5, 30 28, 30 17 C 30 8, 25 1.5, 16 1.5 Z" fill="${color}" stroke="#1a1d22" stroke-width="2"/>
<path d="M16 1.5 C 7 1.5, 2 8, 2 17 C 2 28, 16 41.5, 16 41.5 C 16 41.5, 30 28, 30 17 C 30 8, 25 1.5, 16 1.5 Z" fill="url(#g)" stroke="none"/>
${flag}
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

type MarkerTier = { marker: KakaoMarkerInst; tier: 0 | 1 | 2 | 3; occupied: boolean };

const PINS_CACHE_KEY_BIG = 'mlbg_pins_big_v1';
const PINS_CACHE_KEY_SMALL = 'mlbg_pins_small_v1';
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

export default function AptMap({ pins: pinsFromProps, feed = [] }: { pins?: AptPin[]; feed?: FeedItem[] }) {
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
    if (cachedBig?.pins?.length) {
      bigPins.push(...cachedBig.pins);
      applyPins();
    }
    if (!cachedBig || Date.now() - cachedBig.ts >= PINS_CACHE_TTL_MS) {
      (async () => {
        try {
          const r = await fetch('/api/home-pins');
          if (!r.ok) return;
          const json = (await r.json()) as { pins: AptPin[] };
          if (cancelled) return;
          bigPins.length = 0;
          bigPins.push(...json.pins);
          writePinCache(PINS_CACHE_KEY_BIG, json.pins);
          applyPins();
        } catch { /* ignore */ }
      })();
    }

    // 2단계: 1초 뒤 중소형 — 캐시 우선
    const smallTimer = setTimeout(() => {
      if (cancelled) return;
      const cachedSmall = readPinCache(PINS_CACHE_KEY_SMALL);
      if (cachedSmall?.pins?.length) {
        smallPins.push(...cachedSmall.pins);
        applyPins();
      }
      if (!cachedSmall || Date.now() - cachedSmall.ts >= PINS_CACHE_TTL_MS) {
        (async () => {
          try {
            const r = await fetch('/api/home-pins?detail=1');
            if (!r.ok) return;
            const json = (await r.json()) as { pins: AptPin[] };
            if (cancelled) return;
            smallPins.length = 0;
            smallPins.push(...json.pins);
            writePinCache(PINS_CACHE_KEY_SMALL, json.pins);
            applyPins();
          } catch { /* ignore */ }
        })();
      }
    }, 1000);

    return () => { cancelled = true; clearTimeout(smallTimer); };
  }, [pinsFromProps]);

  // 점거/강제집행 액션 후 핀 갱신 — 서버 unstable_cache + localStorage 모두 무효화 후 refetch
  useEffect(() => {
    function onPinsChanged() {
      try { localStorage.removeItem(PINS_CACHE_KEY_BIG); } catch { /* ignore */ }
      try { localStorage.removeItem(PINS_CACHE_KEY_SMALL); } catch { /* ignore */ }
      (async () => {
        try {
          // ?fresh=1 → 서버측 unstable_cache 우회. revalidateTag 보다 안정적.
          const [bigR, smallR] = await Promise.all([
            fetch('/api/home-pins?fresh=1', { cache: 'no-store' }),
            fetch('/api/home-pins?detail=1&fresh=1', { cache: 'no-store' }),
          ]);
          if (!bigR.ok || !smallR.ok) return;
          const bigJson = (await bigR.json()) as { pins: AptPin[] };
          const smallJson = (await smallR.json()) as { pins: AptPin[] };
          writePinCache(PINS_CACHE_KEY_BIG, bigJson.pins);
          writePinCache(PINS_CACHE_KEY_SMALL, smallJson.pins);
          // big 우선으로 머지 (점거 정보가 정확)
          const seen = new Set<number>();
          const merged: AptPin[] = [];
          for (const p of [...bigJson.pins, ...smallJson.pins]) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            merged.push(p);
          }
          setPins(merged);
        } catch { /* ignore */ }
      })();
    }
    window.addEventListener('mlbg-pins-changed', onPinsChanged);
    return () => window.removeEventListener('mlbg-pins-changed', onPinsChanged);
  }, []);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstRef = useRef<KakaoMapInst | null>(null);
  const markersRef = useRef<MarkerTier[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<AptPin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [occupiedOpen, setOccupiedOpen] = useState(false);
  const [occupierProfiles, setOccupierProfiles] = useState<Map<string, { name: string; link: string | null; isPaid: boolean; isSolo: boolean }>>(new Map());
  const router = useRouter();
  const searchParams = useSearchParams();
  const aiTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ?apt={id} query 로 진입 시 해당 단지 패널 자동 열기 (알림 종 클릭 흐름)
  useEffect(() => {
    const aptParam = searchParams.get('apt');
    if (!aptParam || pins.length === 0) return;
    const aptId = Number(aptParam);
    if (Number.isNaN(aptId)) return;
    const pin = pins.find((p) => p.id === aptId);
    if (pin) {
      setSelected(pin);
      // 지도 중심 이동 + 줌인
      const inst = mapInstRef.current;
      if (inst) {
        const ll = new window.kakao.maps.LatLng(pin.lat, pin.lng);
        inst.setLevel(3);
        inst.panTo(ll);
      }
      // URL 정리 — query 제거 (뒤로가기/새로고침 시 다시 안 열리게)
      router.replace('/', { scroll: false });
    }
  }, [searchParams, pins, router]);

  // 오늘의 강제집행
  type EvictEvent = { occurred_at: string; actor_name: string | null; prev_occupier_name: string | null; apt_id: number; apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null };
  const [evictsOpen, setEvictsOpen] = useState(false);
  const [evicts, setEvicts] = useState<EvictEvent[] | null>(null);
  const [evictCount, setEvictCount] = useState(0);

  // 스코어 랭킹 top 5
  type RankRow = { user_id: string; display_name: string; score: number };
  const [ranking, setRanking] = useState<RankRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/score-ranking');
        if (!r.ok) return;
        const json = (await r.json()) as { ranking: RankRow[] };
        if (!cancelled) setRanking(json.ranking ?? []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // 피드 (단지별 글 최신순). 기본 펼침.
  const [feedOpen, setFeedOpen] = useState(true);
  function jumpToFeedItem(item: FeedItem) {
    // 커뮤니티 글/댓글 → /community/{post_id} 로 이동
    if ((item.kind === 'post' || item.kind === 'post_comment') && item.post_id) {
      router.push(`/community/${item.post_id}`);
      return;
    }
    // 아파트 토론/댓글 → 지도 + 단지 패널
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

  // 카운트만 미리 fetch
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('apt_occupier_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'evict')
      .gte('occurred_at', todayKstStartUtcIso())
      .then(({ count }) => setEvictCount(count ?? 0));
  }, [pins]);

  async function toggleEvicts() {
    if (evictsOpen) { setEvictsOpen(false); return; }
    setEvictsOpen(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('apt_occupier_events')
      .select('occurred_at, actor_name, prev_occupier_name, apt_id, apt_master(apt_nm, dong, lat, lng)')
      .eq('event', 'evict')
      .gte('occurred_at', todayKstStartUtcIso())
      .order('occurred_at', { ascending: false });
    const list: EvictEvent[] = (data ?? []).map((r: Record<string, unknown>) => {
      const am = r.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
      return {
        occurred_at: r.occurred_at as string,
        actor_name: r.actor_name as string | null,
        prev_occupier_name: r.prev_occupier_name as string | null,
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
    const { data } = await supabase.from('profiles').select('id, display_name, link_url, tier, tier_expires_at').in('id', ids);
    const map = new Map<string, { name: string; link: string | null; isPaid: boolean; isSolo: boolean }>();
    const now = Date.now();
    for (const r of (data ?? []) as Array<{ id: string; display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null }>) {
      if (r.display_name) {
        const isPaid = r.tier === 'paid' && (!r.tier_expires_at || new Date(r.tier_expires_at).getTime() > now);
        map.set(r.id, { name: r.display_name, link: r.link_url, isPaid, isSolo: false });
      }
    }
    // is_solo 추가 (SQL 039 적용 후)
    const { data: soloData } = await supabase.from('profiles').select('id, is_solo').in('id', ids);
    if (soloData) {
      for (const s of soloData as Array<{ id: string; is_solo: boolean | null }>) {
        const cur = map.get(s.id);
        if (cur) cur.isSolo = !!s.is_solo;
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
        const center = new window.kakao.maps.LatLng(37.498, 127.027); // 강남 일대
        const map = new window.kakao.maps.Map(mapRef.current, { center, level: 6 }) as KakaoMapInst;
        mapInstRef.current = map;

        // 줌 변경 리스너는 한 번만 등록 — markersRef.current 참조
        window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
          const level = map.getLevel();
          for (const { marker, tier, occupied } of markersRef.current) {
            if (tier === 0 || occupied) continue;
            const visible = (tier === 1 && level <= 7) || (tier === 2 && level <= 5) || (tier === 3 && level <= 4);
            marker.setMap(visible ? map : null);
          }
        });

        setMapReady(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) 마커 갱신 — pins 변경 시 기존 제거 후 재생성. 지도 view는 그대로.
  // 1만개 마커 생성을 setTimeout 으로 청크 분할 → 메인 스레드 차단 최소화.
  useEffect(() => {
    if (!mapReady || !mapInstRef.current) return;
    if (pins.length === 0) return;
    const map = mapInstRef.current;

    // 기존 마커 제거
    for (const { marker } of markersRef.current) marker.setMap(null);
    markersRef.current = [];

    const PIN_W = 32, PIN_H = 45;
    const makeImg = (color: string, occ: boolean) => new window.kakao.maps.MarkerImage(
      buildPinSvg(color, occ),
      new window.kakao.maps.Size(PIN_W, PIN_H),
      { offset: new window.kakao.maps.Point(PIN_W / 2, PIN_H) },
    );
    const pins8 = {
      red: { plain: makeImg(PIN_COLORS.red, false), occ: makeImg(PIN_COLORS.red, true) },
      orange: { plain: makeImg(PIN_COLORS.orange, false), occ: makeImg(PIN_COLORS.orange, true) },
      green: { plain: makeImg(PIN_COLORS.green, false), occ: makeImg(PIN_COLORS.green, true) },
      blue: { plain: makeImg(PIN_COLORS.blue, false), occ: makeImg(PIN_COLORS.blue, true) },
    };
    const dotBlue = new window.kakao.maps.MarkerImage(
      '/pins/blue_dot.svg',
      new window.kakao.maps.Size(20, 20),
      { offset: new window.kakao.maps.Point(10, 10) },
    );

    function pickPin(hh: number | null, occupied: boolean) {
      if (hh === null) return dotBlue;
      const t = hh >= 3000 ? 'red' : hh >= 2000 ? 'orange' : hh >= 1000 ? 'green' : hh >= 300 ? 'blue' : null;
      if (!t) return dotBlue;
      return occupied ? pins8[t].occ : pins8[t].plain;
    }

    const level = map.getLevel();
    const allMarkers: MarkerTier[] = [];
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
        const tier: 0 | 1 | 2 | 3 = hh >= 2000 ? 0 : hh >= 1000 ? 1 : hh >= 300 ? 2 : 3;
        const occupied = !!p.occupier_id;
        const visible = tier === 0 || occupied
          || (tier === 1 && level <= 7) || (tier === 2 && level <= 5) || (tier === 3 && level <= 4);
        const marker = new window.kakao.maps.Marker({
          position: pos,
          title: p.apt_nm,
          clickable: true,
          image: pickPin(p.household_count, occupied),
          map: visible ? map : undefined,
        }) as KakaoMarkerInst;
        window.kakao.maps.event.addListener(marker, 'click', () => setSelected(p));
        allMarkers.push({ marker, tier, occupied });
      }
      markersRef.current = allMarkers;
      if (i < sorted.length) setTimeout(processChunk, 0);
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

      {/* 상단 전광판 — 실시간 스코어 랭킹 TOP 10 (우→좌 마퀴) */}
      {ranking.length > 0 && (
        <div className="absolute top-4 left-[300px] right-4 z-20 bg-black border border-black shadow-[0_2px_8px_rgba(0,0,0,0.4)] px-3 py-2 text-[12px] flex items-center gap-3 tabular-nums tracking-wide">
          <span className="font-bold text-yellow-300 flex-shrink-0 [text-shadow:0_0_6px_rgba(253,224,71,0.6)]">🏆 실시간 스코어 랭킹 TOP 10</span>
          <div className="marquee-mask flex-1 overflow-hidden">
            <div className="marquee-track flex w-max">
              {[0, 1].map((copy) => (
                <div key={copy} aria-hidden={copy === 1} className="flex gap-8 pr-8">
                  {ranking.map((r, i) => (
                    <span key={`${copy}-${r.user_id}`} className="flex-shrink-0">
                      <span className="text-yellow-300 font-bold [text-shadow:0_0_4px_rgba(253,224,71,0.5)]">{i + 1}위</span>{' '}
                      <span className="text-white font-bold [text-shadow:0_0_4px_rgba(255,255,255,0.4)]">{r.display_name}</span>
                      <span className="text-cyan [text-shadow:0_0_4px_rgba(0,176,240,0.6)]"> {r.score}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 좌상단 — 아파트 검색 + 정보 배지 스택 */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 w-[280px]">
        <div className="bg-white border border-border shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center">
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
        <button
          type="button"
          onClick={toggleEvicts}
          className="bg-white border border-red-500 px-3 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-[12px] font-bold text-navy hover:bg-[#fdf0ee] hover:border-red-600 flex items-center gap-1.5"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#ef4444"><path d="M12 2L4 7v6c0 5 4 9 8 10 4-1 8-5 8-10V7l-8-5z"/></svg>
          <span>오늘의 강제집행 : {evictCount}건</span>
          <span className="ml-auto text-[11px] text-muted">{evictsOpen ? '접기 ^' : '펼치기 v'}</span>
        </button>
        {evictsOpen && (
          <div className="bg-white border border-border shadow-[0_4px_20px_rgba(0,0,0,0.12)] w-full max-h-[60vh] overflow-y-auto">
            {evicts === null ? (
              <div className="px-4 py-6 text-[12px] text-muted text-center">불러오는 중...</div>
            ) : evicts.length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-muted text-center">오늘 강제집행 내역 없음</div>
            ) : (
              <ul>
                {evicts.map((e, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => jumpToEvict(e)}
                      className="w-full text-left px-4 py-2.5 border-b border-[#f0f0f0] last:border-b-0 bg-white hover:bg-[#fdf0ee] flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-bold text-navy truncate">{e.apt_nm ?? '(단지 정보 없음)'}</div>
                        <div className="text-[10px] text-muted tabular-nums flex-shrink-0">
                          {occupiedSinceLabel(e.occurred_at)}
                        </div>
                      </div>
                      <div className="text-[11px] flex items-center gap-1">
                        <span className="text-muted line-through">{e.prev_occupier_name ?? '익명'}</span>
                        <span className="text-muted">→</span>
                        <span className="text-cyan font-bold">{e.actor_name ?? '익명'}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={toggleOccupied}
          disabled={occupied.length === 0}
          className="bg-white border border-cyan px-3 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-[12px] font-bold text-navy hover:bg-[#eef4fb] hover:border-navy disabled:opacity-50 flex items-center gap-1.5"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#00B0F0"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" /></svg>
          <span>점거된 아파트 : {occupied.length.toLocaleString()}개단지</span>
          <span className="ml-auto text-[11px] text-muted">{occupiedOpen ? '접기 ^' : '펼치기 v'}</span>
        </button>
        {occupiedOpen && (
          <div className="bg-white border border-border shadow-[0_4px_20px_rgba(0,0,0,0.12)] w-full max-h-[60vh] overflow-y-auto">
            {occupied.length === 0 ? (
              <div className="px-4 py-6 text-[12px] text-muted text-center">점거된 단지 없음</div>
            ) : (
              <ul>
                {occupied.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { jumpToApt(p); setOccupiedOpen(false); }}
                      className="w-full text-left px-4 py-2.5 border-b border-[#f0f0f0] last:border-b-0 bg-white hover:bg-[#eef4fb] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-navy truncate">{p.apt_nm}</div>
                        {p.dong && <div className="text-[10px] text-muted truncate">{p.dong}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[11px] text-cyan font-bold truncate">
                          {p.occupier_id ? (
                            <Nickname info={(() => {
                              const pf = occupierProfiles.get(p.occupier_id);
                              return pf ? { name: pf.name, link: pf.link, isPaid: pf.isPaid, isSolo: pf.isSolo } : { name: '...' };
                            })()} />
                          ) : ''}
                        </div>
                        {p.occupied_at && (
                          <div className="text-[10px] text-muted mt-0.5">{occupiedSinceLabel(p.occupied_at)}</div>
                        )}
                      </div>
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
                  const headLabel = isCommunity ? '커뮤니티' : (f.apt_nm ?? '(단지 정보 없음)');
                  return (
                    <li key={feedKey} className="border-b border-[#f0f0f0] last:border-b-0">
                      <div className="px-3 py-2.5 bg-white hover:bg-[#fafbfc]">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <button
                            type="button"
                            onClick={() => jumpToFeedItem(f)}
                            className="text-[12px] font-bold text-navy truncate hover:underline text-left min-w-0 flex-1"
                          >
                            {headLabel}
                          </button>
                          <span className="text-[10px] text-cyan font-bold flex-shrink-0">
                            <Nickname info={{ name: f.author_name, link: f.author_link, isPaid: f.author_is_paid, isSolo: f.author_is_solo }} />
                          </span>
                        </div>
                        {isComment ? (
                          <div className="text-[12px] text-text leading-snug flex items-start gap-1.5">
                            <span className="text-[9px] font-bold tracking-wider uppercase bg-cyan/15 text-cyan px-1.5 py-0.5 flex-shrink-0 mt-0.5">댓글</span>
                            <span className="whitespace-pre-wrap break-words">{fullContent || f.title}</span>
                          </div>
                        ) : (
                          <>
                            <div className="text-[12px] text-text leading-snug mb-0.5 break-words">{f.title}</div>
                            {fullContent && (
                              <div className="text-[12px] text-text leading-snug whitespace-pre-wrap break-words">{fullContent}</div>
                            )}
                          </>
                        )}
                        <div className="text-[10px] text-muted mt-1">{feedRelTime(f.created_at)} 전</div>
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


      {/* 우측 하단 범례 — 실제 지도 핀과 동일 SVG (깃발 없음) */}
      <div className="absolute bottom-8 right-6 z-20 pointer-events-none">
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
    </div>
  );
}
