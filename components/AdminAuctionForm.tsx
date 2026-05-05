'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminAuctionForm() {
  const router = useRouter();
  const supabase = createClient();
  const [aptId, setAptId] = useState('');
  const [duration, setDuration] = useState('30');
  const [minBid, setMinBid] = useState('100');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const aptNum = Number(aptId);
    const durNum = Number(duration);
    const bidNum = Number(minBid);
    if (!Number.isFinite(aptNum) || aptNum <= 0) { alert('단지 ID가 잘못됐어요'); return; }
    if (!Number.isFinite(durNum) || durNum < 5 || durNum > 1440) { alert('진행 시간은 5분~24시간'); return; }
    if (!Number.isFinite(bidNum) || bidNum <= 0) { alert('시작가가 잘못됐어요'); return; }

    setBusy(true);
    const { data, error } = await supabase.rpc('create_auction', { p_apt_id: aptNum, p_duration_minutes: durNum, p_min_bid: bidNum });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_auction_id: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '경매 생성 실패'); return; }
    alert(`경매 #${row.out_auction_id} 생성 완료`);
    setAptId('');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold tracking-widest uppercase text-muted">단지 ID</label>
        <input
          type="number"
          value={aptId}
          onChange={(e) => setAptId(e.target.value)}
          required
          placeholder="예: 12345"
          className="w-[140px] px-3 py-2 border border-border focus:border-navy text-[13px] tabular-nums outline-none rounded-none"
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
        disabled={busy}
        className="bg-navy text-white px-5 py-2 text-[13px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-50 border-none"
      >
        {busy ? '...' : '경매 시작'}
      </button>
    </form>
  );
}
