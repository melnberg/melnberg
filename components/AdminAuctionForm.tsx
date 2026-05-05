'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifyTelegram } from '@/lib/telegram-notify';

type AptSuggestion = {
  id: number; apt_nm: string; dong: string | null;
  household_count: number | null; occupier_id: string | null;
};

export default function AdminAuctionForm() {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<AptSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<AptSuggestion[]>([]);
  const [duration, setDuration] = useState('30');
  const [minBid, setMinBid] = useState('100');
  const [startsAt, setStartsAt] = useState(''); // YYYY-MM-DDTHH:MM (datetime-local). 빈 값=즉시.
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // debounced search
  useEffect(() => {
    if (picked) return; // picked 상태에선 검색 안 함
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('apt_master')
        .select('id, apt_nm, dong, household_count, occupier_id')
        .ilike('apt_nm', `%${query.trim()}%`)
        .order('household_count', { ascending: false, nullsFirst: false })
        .limit(20);
      setSuggestions((data ?? []) as AptSuggestion[]);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, picked, supabase]);

  function pick(s: AptSuggestion) {
    if (s.occupier_id) { alert('이미 점거된 단지는 경매 등록 불가'); return; }
    setPicked(s);
    setQuery(s.apt_nm);
    setSuggestions([]);
  }

  function clearPick() {
    setPicked(null);
    setQuery('');
    setSuggestions([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!picked) { alert('단지를 검색해서 선택해주세요'); return; }
    const durNum = Number(duration);
    const bidNum = Number(minBid);
    if (!Number.isFinite(durNum) || durNum < 5 || durNum > 1440) { alert('진행 시간은 5분~24시간'); return; }
    if (!Number.isFinite(bidNum) || bidNum <= 0) { alert('시작가가 잘못됐어요'); return; }

    let startsIso: string | null = null;
    if (startsAt.trim()) {
      // datetime-local 은 로컬 시간 — Date 객체가 자동으로 ISO(UTC) 변환
      const d = new Date(startsAt);
      if (!Number.isFinite(d.getTime())) { alert('시작 시각 형식이 잘못됐어요'); return; }
      startsIso = d.toISOString();
    }

    setBusy(true);
    const rpcArgs: Record<string, unknown> = { p_apt_id: picked.id, p_duration_minutes: durNum, p_min_bid: bidNum };
    if (startsIso) rpcArgs.p_starts_at = startsIso;
    const { data, error } = await supabase.rpc('create_auction', rpcArgs);
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_auction_id: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '경매 생성 실패'); return; }
    // 자동 텔레그램 푸시 — fire-and-forget
    if (row.out_auction_id) notifyTelegram('auction_start', row.out_auction_id);
    alert(`경매 #${row.out_auction_id} 생성 완료 — ${picked.apt_nm} (텔레그램 알림 자동 발송)`);
    clearPick();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1 relative flex-1 min-w-[280px]">
          <label className="text-[10px] font-bold tracking-widest uppercase text-muted">단지 검색</label>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => { setPicked(null); setQuery(e.target.value); }}
              placeholder="단지명 입력 (예: 래미안)"
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
          {suggestions.length > 0 && !picked && (
            <ul className="absolute top-full left-0 right-0 z-30 mt-0.5 bg-white border border-border shadow-lg max-h-[280px] overflow-y-auto">
              {suggestions.map((s) => {
                const occupied = !!s.occupier_id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pick(s)}
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
                        {occupied && (
                          <span className="text-[10px] font-bold tracking-widest uppercase bg-[#fce7f3] text-[#9d174d] px-1.5 py-0.5">점거됨</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
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
          선택된 단지 ID: <span className="font-bold text-text tabular-nums">{picked.id}</span>
          {picked.dong && <span> · {picked.dong}</span>}
          {picked.household_count && <span> · {picked.household_count.toLocaleString()}세대</span>}
        </div>
      )}
    </form>
  );
}
