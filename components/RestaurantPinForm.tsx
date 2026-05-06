'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fileToWebp } from '@/lib/image-to-webp';

// Kakao SDK 글로벌
declare global { interface Window { kakao: typeof window.kakao } }

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
const SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`;

function loadKakao(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'));
    if (window.kakao && window.kakao.maps && window.kakao.maps.services) return resolve();
    const existing = document.querySelector(`script[src^="https://dapi.kakao.com/v2/maps/sdk.js"]`);
    if (existing) { existing.addEventListener('load', () => window.kakao.maps.load(() => resolve())); return; }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => reject(new Error('kakao sdk load failed'));
    document.head.appendChild(s);
  });
}

type Place = { id: string; place_name: string; road_address_name: string; address_name: string; x: string; y: string; category_name?: string };

export default function RestaurantPinForm({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [recommendedMenu, setRecommendedMenu] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Kakao 지도 초기화
  useEffect(() => {
    let cancelled = false;
    loadKakao().then(() => {
      if (cancelled || !mapDivRef.current) return;
      const center = new window.kakao.maps.LatLng(37.498, 127.027);
      const map = new window.kakao.maps.Map(mapDivRef.current, { center, level: 4 });
      mapRef.current = map;
      // 클릭 시 마커 이동
      window.kakao.maps.event.addListener(map, 'click', (...args: unknown[]) => {
        const e = args[0] as { latLng: { getLat: () => number; getLng: () => number } };
        const newLat = e.latLng.getLat();
        const newLng = e.latLng.getLng();
        setMarker(newLat, newLng);
        // 역지오코딩으로 주소 획득 — Geocoder 가 typeguard 에 없으면 skip
        const services = window.kakao.maps.services as { Geocoder?: new () => { coord2Address: (lng: number, lat: number, cb: (result: Array<{ road_address?: { address_name: string } | null; address?: { address_name: string } | null }>, status: string) => void) => void } };
        const geocoderClass = services.Geocoder;
        if (geocoderClass) {
          const geocoder = new geocoderClass();
          geocoder.coord2Address(newLng, newLat, (result, status) => {
            if (status === window.kakao.maps.services.Status.OK && result[0]) {
              setAddress(result[0].road_address?.address_name ?? result[0].address?.address_name ?? '');
            }
          });
        }
      });
    }).catch((e) => setErr(`지도 로드 실패: ${String(e)}`));
    return () => { cancelled = true; };
  }, []);

  function setMarker(la: number, ln: number) {
    setLat(la);
    setLng(ln);
    if (!mapRef.current) return;
    const pos = new window.kakao.maps.LatLng(la, ln);
    if (markerRef.current) {
      (markerRef.current as { setMap: (m: unknown) => void }).setMap(null);
    }
    const marker = new window.kakao.maps.Marker({ position: pos }) as unknown as { setMap: (m: unknown) => void };
    marker.setMap(mapRef.current);
    markerRef.current = marker;
    (mapRef.current as { panTo: (p: unknown) => void }).panTo(pos);
  }

  function search() {
    if (!searchQuery.trim()) return;
    const ps = new window.kakao.maps.services.Places();
    ps.keywordSearch(searchQuery.trim(), (data, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        setSearchResults((data as unknown as Place[]).slice(0, 8));
      } else {
        setSearchResults([]);
      }
    });
  }

  function pickPlace(p: Place) {
    setName(p.place_name);
    setAddress(p.road_address_name || p.address_name);
    setMarker(Number(p.y), Number(p.x));
    setSearchResults([]);
    setSearchQuery('');
  }

  async function handlePhoto(file: File) {
    if (file.size > 5 * 1024 * 1024) { setErr('5MB 이하 이미지만 가능합니다.'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);

    if (!name.trim()) { setErr('가게명 필수'); return; }
    if (!description.trim()) { setErr('설명 필수'); return; }
    if (!recommendedMenu.trim()) { setErr('추천메뉴 필수'); return; }
    if (lat == null || lng == null) { setErr('지도에서 위치를 선택하세요'); return; }

    setBusy(true);
    let photoUrl: string | null = null;

    // 사진 업로드 (선택)
    if (photoFile) {
      try {
        const converted = await fileToWebp(photoFile).catch(() => null);
        const blob = converted?.blob ?? photoFile;
        const isWebp = blob !== photoFile;
        const ext = isWebp ? 'webp' : (photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg');
        const contentType = isWebp ? 'image/webp' : photoFile.type;
        const path = `${currentUserId}/restaurant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('post-images').upload(path, blob, { contentType });
        if (upErr) throw new Error(upErr.message);
        const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
        photoUrl = publicUrl;
      } catch (e) {
        setErr(`사진 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
        setBusy(false);
        return;
      }
    }

    const { data, error } = await supabase.rpc('register_restaurant_pin', {
      p_name: name.trim(),
      p_description: description.trim(),
      p_recommended_menu: recommendedMenu.trim(),
      p_lat: lat, p_lng: lng,
      p_photo_url: photoUrl,
      p_address: address || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_id: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { setErr(row?.out_message ?? '등록 실패'); return; }
    alert('등록 완료. +30 mlbg 지급됨.');
    router.push('/restaurants');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* 위치 선택 */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">위치 *</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
            placeholder="가게명/주소 검색 (카카오)"
            className="flex-1 min-w-0 border border-border px-3 py-2 text-[13px] outline-none focus:border-navy"
          />
          <button type="button" onClick={search} className="flex-shrink-0 bg-navy text-white px-4 py-2 text-[12px] font-bold border-none cursor-pointer hover:bg-navy-dark">
            검색
          </button>
        </div>
        {searchResults.length > 0 && (
          <ul className="border border-border max-h-[200px] overflow-y-auto">
            {searchResults.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pickPlace(p)} className="w-full text-left px-3 py-2 hover:bg-bg/40 border-b border-[#f0f0f0] last:border-b-0 bg-white cursor-pointer">
                  <div className="text-[13px] font-bold text-navy">{p.place_name}</div>
                  <div className="text-[11px] text-muted">{p.road_address_name || p.address_name}</div>
                  {p.category_name && <div className="text-[10px] text-muted/70">{p.category_name}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div ref={mapDivRef} className="w-full h-[300px] border border-border bg-[#f0f0f0]" />
        <div className="text-[11px] text-muted">
          {lat != null && lng != null ? (
            <>선택됨: {lat.toFixed(5)}, {lng.toFixed(5)} {address && `· ${address}`}</>
          ) : (
            '검색 또는 지도 클릭으로 위치 선택'
          )}
        </div>
      </div>

      {/* 가게명 */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">가게명 *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
          className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy" />
      </div>

      {/* 설명 */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">설명 * (200자)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2}
          placeholder="이 가게의 분위기/특징/위치 등 (예: 사장님 친절한 한식 백반집, 점심 손님 많음)"
          className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy resize-y leading-relaxed" />
        <div className="text-[10px] text-muted text-right">{description.length}/200</div>
      </div>

      {/* 추천메뉴 */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">추천메뉴 * (200자)</label>
        <textarea value={recommendedMenu} onChange={(e) => setRecommendedMenu(e.target.value)} maxLength={200} rows={2}
          placeholder="가성비 또는 강추 메뉴 (예: 갈비탕 12,000원 — 깍두기 무한리필)"
          className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy resize-y leading-relaxed" />
        <div className="text-[10px] text-muted text-right">{recommendedMenu.length}/200</div>
      </div>

      {/* 사진 */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">사진 (선택, 5MB 이하)</label>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }}
          className="text-[12px]" />
        {photoPreview && (
          <img src={photoPreview} alt="" className="max-w-[300px] max-h-[200px] object-contain border border-border mt-2 rounded-xl" />
        )}
      </div>

      {err && (
        <div className="text-sm px-4 py-3 break-keep leading-relaxed bg-red-50 text-red-700 border border-red-200">{err}</div>
      )}

      <div className="flex justify-end gap-3 mt-2">
        <button type="button" onClick={() => router.back()}
          className="bg-white border border-border text-text px-5 py-3 text-[13px] font-semibold cursor-pointer hover:border-navy hover:text-navy">
          취소
        </button>
        <button type="submit" disabled={busy}
          className="bg-navy text-white border-none px-6 py-3 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50">
          {busy ? '등록 중...' : '등록하고 +30 mlbg 받기'}
        </button>
      </div>
    </form>
  );
}
