'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { revalidateHome } from '@/lib/revalidate-home';

// 어드민 경매 목록의 active 행 액션 — 시간 수정 / 시작가 수정 / 중지.
// 시작가 수정은 입찰자 없을 때만 (RPC 가 검증).
export default function AdminAuctionRowActions({
  auctionId,
  endsAt,
  minBid,
  bidCount,
}: {
  auctionId: number;
  endsAt: string;
  minBid: number;
  bidCount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<'time' | 'price' | null>(null);
  const [newEndsAt, setNewEndsAt] = useState(() => {
    // datetime-local 포맷 (YYYY-MM-DDTHH:MM, KST)
    const d = new Date(endsAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [newMinBid, setNewMinBid] = useState(String(minBid));

  async function handleUpdateTime() {
    if (busy) return;
    if (!newEndsAt) { alert('새 종료 시각을 입력하세요'); return; }
    const d = new Date(newEndsAt);
    if (!Number.isFinite(d.getTime())) { alert('시각 형식이 잘못됨'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('update_auction_ends', { p_auction_id: auctionId, p_new_ends_at: d.toISOString() });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '수정 실패'); return; }
    revalidateHome();
    setOpen(null);
    router.refresh();
  }

  async function handleUpdatePrice() {
    if (busy) return;
    const n = Number(newMinBid);
    if (!Number.isFinite(n) || n <= 0) { alert('시작가가 잘못됐어요'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('update_auction_min_bid', { p_auction_id: auctionId, p_new_min_bid: n });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '수정 실패'); return; }
    revalidateHome();
    setOpen(null);
    router.refresh();
  }

  async function handleCancel() {
    if (busy) return;
    if (!confirm('이 경매를 중지하시겠어요? 입찰자 mlbg 차감은 없습니다.')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('cancel_auction', { p_auction_id: auctionId });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '중지 실패'); return; }
    revalidateHome();
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-stretch gap-1">
      <div className="inline-flex gap-1 justify-end">
        <button
          type="button"
          onClick={() => setOpen(open === 'time' ? null : 'time')}
          disabled={busy}
          className="text-[10px] font-bold tracking-wide text-navy hover:text-navy-dark cursor-pointer bg-transparent border border-border hover:border-navy px-2 py-0.5 disabled:opacity-40"
        >
          시간
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === 'price' ? null : 'price')}
          disabled={busy || bidCount > 0}
          title={bidCount > 0 ? '입찰자가 있어 시작가 수정 불가' : ''}
          className="text-[10px] font-bold tracking-wide text-navy hover:text-navy-dark cursor-pointer bg-transparent border border-border hover:border-navy px-2 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          시작가
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={busy}
          className="text-[10px] font-bold tracking-wide text-red-700 hover:text-red-900 cursor-pointer bg-transparent border border-red-200 hover:border-red-700 px-2 py-0.5 disabled:opacity-40"
        >
          중지
        </button>
      </div>
      {open === 'time' && (
        <div className="flex gap-1 mt-1">
          <input
            type="datetime-local"
            value={newEndsAt}
            onChange={(e) => setNewEndsAt(e.target.value)}
            className="px-1.5 py-0.5 border border-border focus:border-navy text-[10px] tabular-nums outline-none rounded-none"
          />
          <button type="button" onClick={handleUpdateTime} disabled={busy} className="text-[10px] font-bold bg-navy text-white px-2 py-0.5 cursor-pointer disabled:opacity-40 border-none">적용</button>
        </div>
      )}
      {open === 'price' && (
        <div className="flex gap-1 mt-1">
          <input
            type="number"
            value={newMinBid}
            onChange={(e) => setNewMinBid(e.target.value)}
            min={1}
            className="w-[80px] px-1.5 py-0.5 border border-border focus:border-navy text-[10px] tabular-nums outline-none rounded-none"
          />
          <button type="button" onClick={handleUpdatePrice} disabled={busy} className="text-[10px] font-bold bg-navy text-white px-2 py-0.5 cursor-pointer disabled:opacity-40 border-none">적용</button>
        </div>
      )}
    </div>
  );
}
