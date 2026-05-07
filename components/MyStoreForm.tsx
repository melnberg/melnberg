'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fileToWebp } from '@/lib/image-to-webp';
import { revalidateHome } from '@/lib/revalidate-home';

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

export default function MyStoreForm({ currentUserId }: { currentUserId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  // 가게 정보
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [recommended, setRecommended] = useState('');
  const [contact, setContact] = useState('');
  const [url, setUrl] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [dong, setDong] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Place[]>([]);

  // NTS 검증 — DB 저장 X, API 호출에만 사용
  const [bizNo, setBizNo] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [startDt, setStartDt] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadKakao().then(() => {
      if (cancelled || !mapDivRef.current) return;
      const center = new window.kakao.maps.LatLng(37.498, 127.027);
      const map = new window.kakao.maps.Map(mapDivRef.current, { center, level: 4 });
      mapRef.current = map;
      window.kakao.maps.event.addListener(map, 'click', (...args: unknown[]) => {
        const e = args[0] as { latLng: { getLat: () => number; getLng: () => number } };
        const newLat = e.latLng.getLat();
        const newLng = e.latLng.getLng();
        setMarker(newLat, newLng);
        const services = window.kakao.maps.services as { Geocoder?: new () => { coord2Address: (lng: number, lat: number, cb: (result: Array<{ road_address?: { address_name: string } | null; address?: { address_name: string; region_3depth_name?: string } | null }>, status: string) => void) => void } };
        const geocoderClass = services.Geocoder;
        if (geocoderClass) {
          const geocoder = new geocoderClass();
          geocoder.coord2Address(newLng, newLat, (result, status) => {
            if (status === window.kakao.maps.services.Status.OK && result[0]) {
              const r0 = result[0];
              setAddress(r0.road_address?.address_name ?? r0.address?.address_name ?? '');
              const dongName = r0.address?.region_3depth_name ?? '';
              if (dongName) setDong(dongName);
            }
          });
        }
      });
    }).catch((e) => setErr(`지도 로드 실패: ${String(e)}`));
    return () => { cancelled = true; };
  }, []);

  function setMarker(la: number, ln: number) {
    setLat(la); setLng(ln);
    if (!mapRef.current) return;
    const pos = new window.kakao.maps.LatLng(la, ln);
    if (markerRef.current) (markerRef.current as { setMap: (m: unknown) => void }).setMap(null);
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
      } else setSearchResults([]);
    });
  }

  function pickPlace(p: Place) {
    setName(p.place_name);
    setAddress(p.road_address_name || p.address_name);
    setMarker(Number(p.y), Number(p.x));
    setSearchResults([]);
    setSearchQuery('');
    const tokens = (p.address_name || '').split(/\s+/);
    const dongToken = tokens.reverse().find((t) => /[가-힣]+동$/.test(t));
    if (dongToken) setDong(dongToken);
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
    if (lat == null || lng == null) { setErr('지도에서 위치를 선택하세요'); return; }
    if (!photoFile) { setErr('가게 사진 필수'); return; }
    if (!bizNo.replace(/[-\s]/g, '').match(/^\d{10}$/)) { setErr('사업자번호는 숫자 10자리'); return; }
    if (!ownerName.trim()) { setErr('대표자명 필수'); return; }
    if (!startDt.replace(/[-\s.]/g, '').match(/^\d{8}$/)) { setErr('개업일자는 YYYYMMDD 8자리 (예: 20200315)'); return; }

    setBusy(true);

    // 1) NTS 사업자등록정보 진위확인
    let verified = false;
    try {
      const r = await fetch('/api/verify-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b_no: bizNo, p_nm: ownerName, start_dt: startDt }),
      });
      const j = await r.json();
      if (!j?.ok) {
        setErr(`사업자 검증 실패 — ${j?.error ?? 'unknown'}`);
        setBusy(false);
        return;
      }
      verified = true;
    } catch (e) {
      setErr(`사업자 검증 오류: ${e instanceof Error ? e.message : '실패'}`);
      setBusy(false);
      return;
    }

    // 2) 사진 업로드
    let photoUrl: string | null = null;
    try {
      const converted = await fileToWebp(photoFile).catch(() => null);
      const blob = converted?.blob ?? photoFile;
      const isWebp = blob !== photoFile;
      const ext = isWebp ? 'webp' : (photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg');
      const contentType = isWebp ? 'image/webp' : photoFile.type;
      const path = `${currentUserId}/store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('post-images').upload(path, blob, { contentType });
      if (upErr) throw new Error(upErr.message);
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
      photoUrl = publicUrl;
    } catch (e) {
      setErr(`사진 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
      return;
    }

    // 3) 가게 등록 (verified=true)
    const { data, error } = await supabase.rpc('register_my_store', {
      p_name: name.trim(),
      p_category: category.trim() || null,
      p_description: description.trim(),
      p_recommended: recommended.trim() || null,
      p_lat: lat, p_lng: lng,
      p_photo_url: photoUrl,
      p_address: address || null,
      p_dong: dong || null,
      p_contact: contact.trim() || null,
      p_url: url.trim() || null,
      p_verified: verified,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_id: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { setErr(row?.out_message ?? '등록 실패'); return; }
    // out_id 가 비정상이면 상세 대신 목록으로 (404 사고 회피).
    const newId = row.out_id;
    const targetPath = (newId != null && Number.isFinite(Number(newId))) ? `/stores/${newId}` : '/stores';
    alert('가게 등록 완료. 사업자 인증됨. +30 mlbg 지급됨.');
    revalidateHome();
    // router.refresh() 빼고 hard navigation — RSC 캐시·race 방지.
    window.location.assign(targetPath);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* 위치 */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">위치 *</label>
        <div className="flex gap-2">
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
            placeholder="가게명/주소 검색"
            className="flex-1 min-w-0 border border-border px-3 py-2 text-[13px] outline-none focus:border-navy" />
          <button type="button" onClick={search} className="flex-shrink-0 bg-navy text-white px-4 py-2 text-[12px] font-bold border-none cursor-pointer hover:bg-navy-dark">검색</button>
        </div>
        {searchResults.length > 0 && (
          <ul className="border border-border max-h-[200px] overflow-y-auto">
            {searchResults.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pickPlace(p)} className="w-full text-left px-3 py-2 hover:bg-bg/40 border-b border-[#f0f0f0] last:border-b-0 bg-white cursor-pointer">
                  <div className="text-[13px] font-bold text-navy">{p.place_name}</div>
                  <div className="text-[11px] text-muted">{p.road_address_name || p.address_name}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div ref={mapDivRef} className="w-full h-[300px] border border-border bg-[#f0f0f0]" />
        <div className="text-[11px] text-muted">
          {lat != null && lng != null ? <>선택됨: {lat.toFixed(5)}, {lng.toFixed(5)} {address && `· ${address}`}</> : '검색 또는 지도 클릭'}
        </div>
      </div>

      {/* 가게명 / 카테고리 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1 lg:col-span-2">
          <label className="text-[11px] font-bold tracking-widest uppercase text-muted">가게명 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold tracking-widest uppercase text-muted">카테고리</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={30} placeholder="카페·헬스장·미용실·기타" className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy" />
        </div>
      </div>

      {/* 설명 / 추천 */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">설명 * (500자)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3}
          placeholder="가게 분위기·특징·운영 시간 등"
          className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy resize-y leading-relaxed" />
        <div className="text-[10px] text-muted text-right">{description.length}/500</div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">대표 메뉴/서비스 (200자)</label>
        <textarea value={recommended} onChange={(e) => setRecommended(e.target.value)} maxLength={200} rows={2}
          placeholder="강추 메뉴 또는 메인 서비스"
          className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy resize-y leading-relaxed" />
      </div>

      {/* 연락 / URL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold tracking-widest uppercase text-muted">연락처</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="전화번호 / 오픈채팅 등" className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold tracking-widest uppercase text-muted">홈페이지·SNS</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://instagram.com/..." className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy" />
        </div>
      </div>

      {/* 사진 */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold tracking-widest uppercase text-muted">가게 사진 * (5MB 이하)</label>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }}
          className="text-[12px]" />
        {photoPreview && <img src={photoPreview} alt="" className="max-w-[300px] max-h-[200px] object-contain border border-border mt-2 rounded-xl" />}
      </div>

      {/* NTS 검증 — DB 저장 X, 진위확인용 */}
      <div className="border-2 border-cyan/40 bg-cyan/5 px-4 py-4 flex flex-col gap-3">
        <div>
          <div className="text-[13px] font-bold text-navy">🔒 사업자 진위 확인</div>
          <p className="text-[11px] text-muted leading-relaxed mt-1">
            국세청 공공 API 로 즉시 확인. 입력값은 검증에만 쓰이고 <b>DB 에 저장되지 않습니다</b>.
            세 항목 모두 사업자등록증과 정확히 일치해야 등록 가능.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold tracking-widest uppercase text-muted">사업자번호</label>
            <input value={bizNo} onChange={(e) => setBizNo(e.target.value)} placeholder="1234567890 (10자리)" inputMode="numeric"
              className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy tabular-nums" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold tracking-widest uppercase text-muted">대표자명</label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="홍길동"
              className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold tracking-widest uppercase text-muted">개업일자</label>
            <input value={startDt} onChange={(e) => setStartDt(e.target.value)} placeholder="20200315 (YYYYMMDD)" inputMode="numeric"
              className="border border-border px-3 py-2 text-[14px] outline-none focus:border-navy tabular-nums" />
          </div>
        </div>
      </div>

      {err && <div className="text-sm px-4 py-3 break-keep leading-relaxed bg-red-50 text-red-700 border border-red-200">{err}</div>}

      <div className="flex justify-end gap-3 mt-2">
        <button type="button" onClick={() => router.back()}
          className="bg-white border border-border text-text px-5 py-3 text-[13px] font-semibold cursor-pointer hover:border-navy hover:text-navy">취소</button>
        <button type="submit" disabled={busy}
          className="bg-navy text-white border-none px-6 py-3 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50">
          {busy ? '등록 중...' : '검증 후 등록 (+30 mlbg)'}
        </button>
      </div>
    </form>
  );
}
