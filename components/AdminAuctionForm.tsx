'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifyTelegram } from '@/lib/telegram-notify';

type AssetType = 'apt' | 'factory' | 'emart';

type AptSuggestion = {
  id: number; apt_nm: string; dong: string | null;
  household_count: number | null; occupier_id: string | null;
};
type FactorySuggestion = {
  id: number; brand: string; name: string; address: string | null; occupy_price: number | null;
  occupied: boolean;
};
type EmartSuggestion = {
  id: number; name: string; address: string | null; occupied: boolean;
};

type Picked =
  | { type: 'apt'; row: AptSuggestion }
  | { type: 'factory'; row: FactorySuggestion }
  | { type: 'emart'; row: EmartSuggestion };

const FACTORY_BRAND_LABEL: Record<string, string> = {
  hynix: 'SK하이닉스', samsung: '삼성전자', costco: '코스트코',
  union: '금속노조', cargo: '화물연대', terminal: '터미널', station: '기차역',
};

export default function AdminAuctionForm() {
  const router = useRouter();
  const supabase = createClient();
  const [assetType, setAssetType] = useState<AssetType>('apt');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [aptSugs, setAptSugs] = useState<AptSuggestion[]>([]);
  const [factorySugs, setFactorySugs] = useState<FactorySuggestion[]>([]);
  const [emartSugs, setEmartSugs] = useState<EmartSuggestion[]>([]);
  const [duration, setDuration] = useState('30');
  const [minBid, setMinBid] = useState('100');
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 타입 변경 시 picker/query 초기화
  useEffect(() => {
    setPicked(null);
    setQuery('');
    setAptSugs([]); setFactorySugs([]); setEmartSugs([]);
  }, [assetType]);

  // 자산 타입별 검색
  useEffect(() => {
    if (picked) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setAptSugs([]); setFactorySugs([]); setEmartSugs([]); return; }
    debounceRef.current = setTimeout(async () => {
      if (assetType === 'apt') {
        const { data } = await supabase
          .from('apt_master')
          .select('id, apt_nm, dong, household_count, occupier_id')
          .ilike('apt_nm', `%${query.trim()}%`)
          .order('household_count', { ascending: false, nullsFirst: false })
          .limit(20);
        setAptSugs((data ?? []) as AptSuggestion[]);
      } else if (assetType === 'factory') {
        // factory_locations 검색 + 점거 여부 join
        const { data: locs } = await supabase
          .from('factory_locations')
          .select('id, brand, name, address, occupy_price')
          .ilike('name', `%${query.trim()}%`)
          .limit(30);
        const list = (locs ?? []) as Array<{ id: number; brand: string; name: string; address: string | null; occupy_price: number | null }>;
        if (list.length === 0) { setFactorySugs([]); return; }
        const ids = list.map((r) => r.id);
        const { data: occs } = await supabase.from('factory_occupations').select('factory_id').in('factory_id', ids);
        const occSet = new Set(((occs ?? []) as Array<{ factory_id: number }>).map((r) => r.factory_id));
        setFactorySugs(list.map((r) => ({ ...r, occupied: occSet.has(r.id) })));
      } else if (assetType === 'emart') {
        const { data: locs } = await supabase
          .from('emart_locations')
          .select('id, name, address')
          .ilike('name', `%${query.trim()}%`)
          .limit(30);
        const list = (locs ?? []) as Array<{ id: number; name: string; address: string | null }>;
        if (list.length === 0) { setEmartSugs([]); return; }
        const ids = list.map((r) => r.id);
        const { data: occs } = await supabase.from('emart_occupations').select('emart_id').in('emart_id', ids);
        const occSet = new Set(((occs ?? []) as Array<{ emart_id: number }>).map((r) => r.emart_id));
        setEmartSugs(list.map((r) => ({ ...r, occupied: occSet.has(r.id) })));
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, picked, supabase, assetType]);

  function pickApt(s: AptSuggestion) {
    if (s.occupier_id) { alert('이미 점거된 단지는 경매 등록 불가'); return; }
    setPicked({ type: 'apt', row: s }); setQuery(s.apt_nm); setAptSugs([]);
  }
  function pickFactory(s: FactorySuggestion) {
    if (s.occupied) { alert('이미 점거된 시설은 경매 등록 불가'); return; }
    setPicked({ type: 'factory', row: s }); setQuery(`${FACTORY_BRAND_LABEL[s.brand] ?? s.brand} ${s.name}`); setFactorySugs([]);
  }
  function pickEmart(s: EmartSuggestion) {
    if (s.occupied) { alert('이미 점거된 매장은 경매 등록 불가'); return; }
    setPicked({ type: 'emart', row: s }); setQuery(s.name); setEmartSugs([]);
  }
  function clearPick() {
    setPicked(null); setQuery('');
    setAptSugs([]); setFactorySugs([]); setEmartSugs([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!picked) { alert('자산을 검색해서 선택해주세요'); return; }
    const durNum = Number(duration);
    const bidNum = Number(minBid);
    if (!Number.isFinite(durNum) || durNum < 5 || durNum > 1440) { alert('진행 시간은 5분~24시간'); return; }
    if (!Number.isFinite(bidNum) || bidNum <= 0) { alert('시작가가 잘못됐어요'); return; }

    let startsIso: string | null = null;
    if (startsAt.trim()) {
      const d = new Date(startsAt);
      if (!Number.isFinite(d.getTime())) { alert('시작 시각 형식이 잘못됐어요'); return; }
      startsIso = d.toISOString();
    }

    setBusy(true);
    const rpcArgs: Record<string, unknown> = {
      p_asset_type: picked.type,
      p_asset_id: picked.row.id,
      p_duration_minutes: durNum,
      p_min_bid: bidNum,
    };
    if (startsIso) rpcArgs.p_starts_at = startsIso;
    const { data, error } = await supabase.rpc('create_auction', rpcArgs);
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_auction_id: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '경매 생성 실패'); return; }
    if (row.out_auction_id) notifyTelegram('auction_start', row.out_auction_id);
    const label = picked.type === 'apt'
      ? (picked.row as AptSuggestion).apt_nm
      : picked.type === 'factory'
        ? `${FACTORY_BRAND_LABEL[(picked.row as FactorySuggestion).brand] ?? ''} ${(picked.row as FactorySuggestion).name}`
        : (picked.row as EmartSuggestion).name;
    alert(`경매 #${row.out_auction_id} 생성 완료 — ${label} (텔레그램 알림 자동 발송)`);
    clearPick();
    router.refresh();
  }

  const placeholder = assetType === 'apt' ? '단지명 입력 (예: 래미안)'
    : assetType === 'factory' ? '시설명 입력 (예: 이천, 평택, 인천지부)'
    : '매장명 입력 (예: 왕십리)';

  const inputLabel = assetType === 'apt' ? '단지 검색' : assetType === 'factory' ? '시설 검색 (공장/노조/터미널/역)' : '이마트 매장 검색';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* 자산 타입 탭 */}
      <div className="flex gap-1">
        {(['apt', 'factory', 'emart'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setAssetType(t)}
            className={`px-4 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer border ${
              assetType === t
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-text border-border hover:border-navy'
            }`}
          >
            {t === 'apt' ? '단지' : t === 'factory' ? '공장·시설' : '이마트'}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1 relative flex-1 min-w-[280px]">
          <label className="text-[10px] font-bold tracking-widest uppercase text-muted">{inputLabel}</label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => { setPicked(null); setQuery(e.target.value); }}
              placeholder={placeholder}
              className={`w-full px-3 py-2 border ${picked ? 'border-cyan bg-cyan/5' : 'border-border focus:border-navy'} text-[13px] outline-none rounded-none`}
            />
            {picked && (
              <button
                type="button"
                onClick={clearPick}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-muted hover:text-red-600 bg-transparent border-none cursor-pointer text-[14px] font-bold"
                aria-label="초기화"
              >
                ✕
              </button>
            )}
          </div>
          {/* 단지 suggestions */}
          {assetType === 'apt' && aptSugs.length > 0 && !picked && (
            <ul className="absolute top-full left-0 right-0 z-30 mt-0.5 bg-white border border-border shadow-lg max-h-[280px] overflow-y-auto">
              {aptSugs.map((s) => {
                const occupied = !!s.occupier_id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickApt(s)}
                      disabled={occupied}
                      className={`w-full text-left px-3 py-2 border-b border-[#f0f0f0] last:border-b-0 ${
                        occupied ? 'bg-bg/50 text-muted cursor-not-allowed' : 'bg-white hover:bg-cyan/10 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className={`text-[13px] font-bold truncate ${occupied ? 'text-muted line-through' : 'text-navy'}`}>{s.apt_nm}</div>
                          <div className="text-[10px] text-muted truncate">
                            {s.dong ?? ''} {s.household_count ? `· ${s.household_count.toLocaleString()}세대` : ''}
                          </div>
                        </div>
                        {occupied && <span className="text-[10px] font-bold tracking-widest uppercase bg-[#fce7f3] text-[#9d174d] px-1.5 py-0.5">점거됨</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* 공장 suggestions */}
          {assetType === 'factory' && factorySugs.length > 0 && !picked && (
            <ul className="absolute top-full left-0 right-0 z-30 mt-0.5 bg-white border border-border shadow-lg max-h-[280px] overflow-y-auto">
              {factorySugs.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pickFactory(s)}
                    disabled={s.occupied}
                    className={`w-full text-left px-3 py-2 border-b border-[#f0f0f0] last:border-b-0 ${
                      s.occupied ? 'bg-bg/50 text-muted cursor-not-allowed' : 'bg-white hover:bg-cyan/10 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-bold truncate ${s.occupied ? 'text-muted line-through' : 'text-navy'}`}>
                          <span className="text-cyan mr-1">[{FACTORY_BRAND_LABEL[s.brand] ?? s.brand}]</span>
                          {s.name}
                        </div>
                        <div className="text-[10px] text-muted truncate">
                          {s.address ?? ''} {s.occupy_price ? `· 분양가 ${Number(s.occupy_price).toLocaleString()} mlbg` : ''}
                        </div>
                      </div>
                      {s.occupied && <span className="text-[10px] font-bold tracking-widest uppercase bg-[#fce7f3] text-[#9d174d] px-1.5 py-0.5">점거됨</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* 이마트 suggestions */}
          {assetType === 'emart' && emartSugs.length > 0 && !picked && (
            <ul className="absolute top-full left-0 right-0 z-30 mt-0.5 bg-white border border-border shadow-lg max-h-[280px] overflow-y-auto">
              {emartSugs.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pickEmart(s)}
                    disabled={s.occupied}
                    className={`w-full text-left px-3 py-2 border-b border-[#f0f0f0] last:border-b-0 ${
                      s.occupied ? 'bg-bg/50 text-muted cursor-not-allowed' : 'bg-white hover:bg-cyan/10 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-bold truncate ${s.occupied ? 'text-muted line-through' : 'text-navy'}`}>{s.name}</div>
                        <div className="text-[10px] text-muted truncate">{s.address ?? ''}</div>
                      </div>
                      {s.occupied && <span className="text-[10px] font-bold tracking-widest uppercase bg-[#fce7f3] text-[#9d174d] px-1.5 py-0.5">점거됨</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold tracking-widest uppercase text-muted" title="비워두면 즉시 시작">시작 시각 (선택)</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-[180px] px-3 py-2 border border-border focus:border-navy text-[13px] tabular-nums outline-none rounded-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold tracking-widest uppercase text-muted">진행 시간 (분)</label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            min={5}
            max={1440}
            className="w-[100px] px-3 py-2 border border-border focus:border-navy text-[13px] tabular-nums outline-none rounded-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold tracking-widest uppercase text-muted">시작가 (mlbg)</label>
          <input
            type="number"
            value={minBid}
            onChange={(e) => setMinBid(e.target.value)}
            required
            min={1}
            className="w-[120px] px-3 py-2 border border-border focus:border-navy text-[13px] tabular-nums outline-none rounded-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !picked}
          className="bg-navy text-white px-5 py-2 text-[13px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed border-none"
        >
          {busy ? '...' : '경매 시작'}
        </button>
      </div>
      {picked && (
        <div className="text-[11px] text-muted">
          <span className="font-bold text-navy mr-2">[{picked.type === 'apt' ? '단지' : picked.type === 'factory' ? '공장·시설' : '이마트'}]</span>
          ID: <span className="font-bold text-text tabular-nums">{picked.row.id}</span>
        </div>
      )}
    </form>
  );
}
