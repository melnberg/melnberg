'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifyTelegram } from '@/lib/telegram-notify';

export type EmartItem = {
  id: number;
  kakao_place_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  occupier_id: string | null;
  occupier_name: string | null;
  occupied_at?: string | null;
  last_claimed_at?: string | null;
};

type Props = {
  emart: EmartItem;
  onClose: () => void;
  onChanged: () => void; // 분양/청구 후 부모 list 재조회
};

function fmtKstShort(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function EmartPanel({ emart, onClose, onChanged }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUid(data?.user?.id ?? null), () => {});
  }, [supabase]);

  const isMine = !!emart.occupier_id && emart.occupier_id === currentUid;
  const lastClaimMs = emart.last_claimed_at
    ? new Date(emart.last_claimed_at).getTime()
    : (emart.occupied_at ? new Date(emart.occupied_at).getTime() : null);
  const daysOwed = lastClaimMs ? Math.floor((Date.now() - lastClaimMs) / 86400000) : 0;
  const totalDays = emart.occupied_at ? Math.floor((Date.now() - new Date(emart.occupied_at).getTime()) / 86400000) : 0;

  async function occupy() {
    if (busy) return;
    if (emart.occupier_id) { alert(`이미 ${emart.occupier_name ?? '다른 사람'} 님이 보유 중`); return; }
    if (!confirm(`${emart.name}\n5 mlbg 로 분양받습니다. (1인 1점포 — 다른 이마트 보유 시 거절됨)`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('occupy_emart', { p_emart_id: emart.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '분양 실패'); return; }
    alert(`${emart.name} 분양 완료. 5 mlbg 차감.`);
    notifyTelegram('emart_occupy', emart.id);
    onChanged();
    onClose();
    router.refresh();
  }

  async function claim() {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('claim_emart_income');
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_earned: number; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '청구 실패'); return; }
    alert(`+${row.out_earned} mlbg 수익 청구 완료.`);
    onChanged();
    router.refresh();
  }

  async function release() {
    if (busy) return;
    if (!confirm('이마트 보유를 해제하고 5 mlbg 환불받습니다. 진행할까요?')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('release_emart');
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '해제 실패'); return; }
    alert('해제 완료. 5 mlbg 환불.');
    onChanged();
    onClose();
    router.refresh();
  }

  return (
    <>
      <div className="fixed inset-0 z-[170] bg-black/40" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-[180] w-[420px] max-w-[100vw] h-screen bg-white border-l border-border shadow-[-8px_0_32px_rgba(0,0,0,0.15)] flex flex-col">
        {/* 헤더 — 노란 바 */}
        <div className="bg-[#F5A623] px-5 py-4 flex items-center gap-3 flex-shrink-0">
          <img src="/pins/emart.svg" alt="" className="w-9 h-12 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold tracking-widest uppercase text-white/80 mb-0.5">EMART · 이마트 분양</div>
            <h1 className="text-[18px] font-bold text-white truncate">{emart.name}</h1>
            {emart.address && <div className="text-[11px] text-white/80 truncate">{emart.address}</div>}
          </div>
          <button type="button" onClick={onClose} className="text-white/90 hover:text-white text-[20px] leading-none px-1 cursor-pointer bg-transparent border-none">✕</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 사장 + 수익 카드 */}
          <div className="border-2 border-[#F5A623] bg-[#fffaf0] px-4 py-4 mb-3">
            {emart.occupier_id ? (
              <>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[10px] tracking-widest uppercase text-muted">사장</span>
                  <span className="text-[18px] font-bold text-navy truncate">{emart.occupier_name ?? '익명'} 님</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[10px] tracking-widest uppercase text-muted">누적 수익</span>
                  <span className="text-[20px] font-black text-cyan tabular-nums">{totalDays} <span className="text-[12px] text-muted">mlbg</span></span>
                </div>
                {isMine && (
                  <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-[#F5A623]/30">
                    <span className="text-[10px] tracking-widest uppercase text-[#dc2626]">청구 가능</span>
                    <span className="text-[18px] font-black text-[#dc2626] tabular-nums">{daysOwed} <span className="text-[12px]">mlbg</span></span>
                  </div>
                )}
                {emart.occupied_at && (
                  <div className="text-[10px] text-muted mt-2">
                    분양일: {fmtKstShort(emart.occupied_at)}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-[10px] tracking-widest uppercase text-muted mb-1">분양가</div>
                <div className="text-[28px] font-black tabular-nums text-navy">5 <span className="text-[14px] text-muted">mlbg</span></div>
                <div className="text-[11px] text-muted mt-2">매일 1 mlbg 자동 수익 · <b className="text-navy">5일이면 회수</b></div>
              </>
            )}
          </div>

          {/* 수익 안내 */}
          <div className="border-l-4 border-cyan bg-cyan/5 px-4 py-3 mb-4">
            <div className="text-[12px] font-bold text-navy mb-1">💰 매일 1 mlbg 자동 수익</div>
            <div className="text-[11px] text-muted leading-relaxed">
              24시간마다 1 mlbg 누적. 사장이 직접 청구 → 잔액 입금. 1인 1점포 제한.
            </div>
          </div>

          {/* 액션 */}
          <div className="grid gap-2 mb-4">
            {isMine ? (
              <>
                <button
                  type="button"
                  onClick={claim}
                  disabled={busy || daysOwed < 1}
                  className="bg-cyan text-navy border-none px-4 py-2.5 text-[13px] font-black tracking-wide hover:bg-cyan/80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {daysOwed >= 1 ? `수익 청구 (+${daysOwed} mlbg)` : '아직 24시간 안 지남'}
                </button>
                <button
                  type="button"
                  onClick={release}
                  disabled={busy}
                  className="bg-white border border-border text-text px-4 py-2 text-[12px] font-bold tracking-wide hover:border-red-500 hover:text-red-600 disabled:opacity-50 cursor-pointer"
                >
                  보유 해제 (5 mlbg 환불)
                </button>
              </>
            ) : !emart.occupier_id ? (
              <button
                type="button"
                onClick={occupy}
                disabled={busy}
                className="bg-[#F5A623] text-white border-none px-4 py-2.5 text-[13px] font-black tracking-wide hover:bg-[#e8901a] disabled:opacity-50 cursor-pointer"
              >
                분양받기 (5 mlbg)
              </button>
            ) : (
              <div className="bg-bg/50 border border-border px-4 py-2.5 text-[12px] text-muted text-center">분양 마감 — 사장이 해제하면 다시 분양 가능</div>
            )}
          </div>

          {/* 매도/매수 — 곧 출시 */}
          <div className="border border-dashed border-border px-4 py-3 text-center mb-4">
            <div className="text-[11px] text-muted mb-1">매도·매수 (호가 시장)</div>
            <div className="text-[10px] text-muted">곧 출시 — 사장끼리 자유롭게 거래 가능</div>
          </div>

          {/* 댓글 — 곧 출시 */}
          <div className="border border-border px-4 py-4 text-center">
            <div className="text-[12px] font-bold text-navy mb-1">💬 매장 후기·댓글</div>
            <div className="text-[10px] text-muted">곧 출시</div>
          </div>
        </div>
      </aside>
    </>
  );
}
