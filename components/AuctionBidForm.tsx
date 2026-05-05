'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifyTelegram } from '@/lib/telegram-notify';

type Props = {
  auctionId: number;
  initialStartsAt: string;
  initialEndsAt: string;
  initialCurrentBid: number | null;
  initialCurrentBidderName: string | null;
  minBid: number;
  initialBidCount: number;
  isActive: boolean;
  isLoggedIn: boolean;
  myBalance: number | null;
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AuctionBidForm({
  auctionId, initialStartsAt, initialEndsAt, initialCurrentBid, initialCurrentBidderName,
  minBid, initialBidCount, isActive, isLoggedIn, myBalance,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [endsAt, setEndsAt] = useState(initialEndsAt);
  const [currentBid, setCurrentBid] = useState(initialCurrentBid);
  const [currentBidderName, setCurrentBidderName] = useState(initialCurrentBidderName);
  const [bidCount, setBidCount] = useState(initialBidCount);
  const [bidInput, setBidInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [extendedFlash, setExtendedFlash] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startsTs = new Date(initialStartsAt).getTime();
  const endsTs = new Date(endsAt).getTime();
  const isPending = now < startsTs;
  const remainingMs = isPending ? startsTs - now : endsTs - now;

  // 5초마다 폴링 — 다른 사람 입찰 즉시 반영
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    const id = setInterval(async () => {
      const { data } = await supabase
        .from('apt_auctions')
        .select('ends_at, current_bid, current_bidder_id, bid_count, status')
        .eq('id', auctionId)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as { ends_at: string; current_bid: number | null; current_bidder_id: string | null; bid_count: number; status: string };
      if (row.ends_at !== endsAt) setEndsAt(row.ends_at);
      if (row.current_bid !== currentBid) {
        setCurrentBid(row.current_bid);
        setBidCount(row.bid_count);
        if (row.current_bidder_id) {
          const { data: pr } = await supabase.from('profiles').select('display_name').eq('id', row.current_bidder_id).maybeSingle();
          setCurrentBidderName((pr as { display_name?: string | null } | null)?.display_name ?? '익명');
        }
      }
      if (row.status !== 'active') {
        // 경매 종료 감지 → 클라이언트 핀 캐시 무효화 (홈 지도 깃발 즉시 반영)
        try { localStorage.removeItem('mlbg_pins_big_v3'); localStorage.removeItem('mlbg_pins_small_v3'); } catch { /* ignore */ }
        window.dispatchEvent(new Event('mlbg-pins-changed'));
        router.refresh();
      }
    }, 5000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId, isActive, endsAt, currentBid]);

  async function handleBid() {
    if (busy) return;
    const amount = Number(bidInput);
    if (!Number.isFinite(amount) || amount <= 0) { alert('입찰 금액을 정수로 입력하세요.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('place_auction_bid', { p_auction_id: auctionId, p_amount: amount });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null; out_new_ends_at: string | null; out_extended: boolean } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '입찰 실패'); return; }
    setCurrentBid(amount);
    setBidCount((c) => c + 1);
    setBidInput('');
    if (row.out_new_ends_at) setEndsAt(row.out_new_ends_at);
    if (row.out_extended) {
      setExtendedFlash(true);
      setTimeout(() => setExtendedFlash(false), 3000);
    }
    // 텔레그램 알림 — fire-and-forget. 실패해도 입찰 흐름 영향 없음.
    notifyTelegram('auction_bid', auctionId);
    router.refresh();
  }

  const minimumNext = Math.max(minBid, (currentBid ?? 0) + 1);
  // 안티스나이프 윈도우 — 3분 이하 남으면 빨강·펄스
  const lastFiveMinutes = remainingMs > 0 && remainingMs < 3 * 60 * 1000;

  const startsKr = new Date(initialStartsAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
  const endsKr = new Date(endsAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

  return (
    <div className={`border-2 ${isPending ? 'border-cyan bg-cyan/5' : isActive ? 'border-[#dc2626] bg-[#fef2f2]' : 'border-border bg-white'} px-6 py-5`}>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="text-[10px] tracking-widest uppercase text-muted mb-1">{isPending ? '시작가' : '현재 최고가'}</div>
          <div className="text-[36px] font-black tabular-nums text-navy leading-none">
            {currentBid != null ? `${Number(currentBid).toLocaleString()}` : Number(minBid).toLocaleString()}
            <span className="text-[14px] text-muted ml-1.5">mlbg</span>
          </div>
          <div className="text-[11px] text-muted mt-1">
            {isPending
              ? `시작 ${startsKr} 부터`
              : currentBid == null ? `시작가 (입찰 없음)` : `${currentBidderName ?? '익명'} 님 · 입찰 ${bidCount}건`}
          </div>
        </div>
        <div className={`text-right ${lastFiveMinutes && !isPending ? 'animate-pulse' : ''}`}>
          <div className="text-[10px] tracking-widest uppercase text-muted mb-1">{isPending ? '시작까지' : '남은 시간'}</div>
          <div className={`text-[24px] font-black tabular-nums leading-none ${isPending ? 'text-cyan' : lastFiveMinutes ? 'text-[#dc2626]' : 'text-navy'}`}>
            {formatRemaining(remainingMs)}
          </div>
          <div className="text-[11px] text-muted mt-1 tabular-nums">
            {isPending ? `종료 ${endsKr}` : `종료 ${endsKr}`}
          </div>
        </div>
      </div>

      {extendedFlash && (
        <div className="mt-2 mb-2 px-3 py-2 bg-[#fbbf24] text-[#92400e] text-[12px] font-bold animate-slide-in-right">
          ⚡ 종료 3분 전 입찰 — +3분 자동 연장!
        </div>
      )}

      {isPending ? (
        <div className="mt-3 pt-3 border-t border-cyan/40 text-[12px] text-cyan font-bold text-center">
          ⏰ 아직 시작 전 — {startsKr} 에 입찰 시작
        </div>
      ) : isActive ? (
        isLoggedIn ? (
          <div className="mt-4 pt-4 border-t border-[#dc2626]/30">
            <div className="text-[11px] text-muted mb-2">
              최소 입찰가 <span className="font-bold tabular-nums text-text">{Number(minimumNext).toLocaleString()} mlbg</span>
              {myBalance != null && <span className="ml-2">· 내 잔액 <span className="font-bold tabular-nums text-cyan">{myBalance.toLocaleString()} mlbg</span></span>}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                min={minimumNext}
                step={1}
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                placeholder={`${Number(minimumNext).toLocaleString()} 이상`}
                className="flex-1 px-3 py-2 border-2 border-border focus:border-navy text-[14px] font-bold tabular-nums outline-none rounded-none"
              />
              <button
                type="button"
                onClick={handleBid}
                disabled={busy || !bidInput.trim()}
                className="bg-[#dc2626] text-white px-6 py-2 text-[13px] font-bold tracking-wide cursor-pointer hover:bg-[#b91c1c] disabled:opacity-40 disabled:cursor-not-allowed border-none"
              >
                {busy ? '...' : '입찰'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t border-[#dc2626]/30 text-center">
            <a href={`/login?next=/auctions/${auctionId}`} className="inline-block bg-navy text-white px-6 py-2 text-[13px] font-bold no-underline hover:bg-navy-dark">
              로그인하고 입찰하기
            </a>
          </div>
        )
      ) : (
        <div className="mt-3 pt-3 border-t border-border text-[12px] text-muted text-center">
          종료된 경매입니다.
        </div>
      )}
    </div>
  );
}
