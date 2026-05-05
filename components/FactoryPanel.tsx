'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifyTelegram } from '@/lib/telegram-notify';
import { awardMlbg } from '@/lib/mlbg-award';
import RewardTooltip from './RewardTooltip';

export type FactoryItem = {
  id: number;
  brand: 'hynix' | 'samsung' | 'costco' | 'union' | 'cargo' | 'terminal' | 'station';
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  occupy_price: number;
  daily_income: number;
  occupier_id: string | null;
  occupier_name: string | null;
  occupied_at?: string | null;
  last_claimed_at?: string | null;
  listing_price?: number | null;
  listing_description?: string | null;
};

type FactoryComment = { id: number; author_id: string; author_name: string | null; content: string; created_at: string };

type Props = { factory: FactoryItem; onClose: () => void; onChanged: () => void };

const BRAND_META: Record<FactoryItem['brand'], { label: string; bg: string; iconBg: string; pin: string }> = {
  hynix:   { label: 'SK하이닉스 캠퍼스', bg: '#E51E2A', iconBg: '#fee2e2', pin: '/pins/factory-hynix.svg' },
  samsung: { label: '삼성전자 캠퍼스', bg: '#1428A0', iconBg: '#dbeafe', pin: '/pins/factory-samsung.svg' },
  costco:  { label: '코스트코',         bg: '#005DAA', iconBg: '#dbeafe', pin: '/pins/factory-costco.svg' },
  union:   { label: '전국금속노조',     bg: '#0F3D8E', iconBg: '#dbeafe', pin: '/pins/factory-union.svg' },
  cargo:   { label: '화물연대',         bg: '#1F8A4C', iconBg: '#dcfce7', pin: '/pins/factory-cargo.svg' },
  terminal:{ label: '버스터미널',       bg: '#7C3AED', iconBg: '#ede9fe', pin: '/pins/factory-terminal.svg' },
  station: { label: '기차역',           bg: '#0F766E', iconBg: '#ccfbf1', pin: '/pins/factory-station.svg' },
};

function fmtKstShort(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function FactoryPanel({ factory, onClose, onChanged }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [sellDescInput, setSellDescInput] = useState('');
  const [sellPanelOpen, setSellPanelOpen] = useState(false);
  const [comments, setComments] = useState<FactoryComment[]>([]);
  const [earnedMap, setEarnedMap] = useState<Record<number, number>>({});
  const [commentInput, setCommentInput] = useState('');

  const meta = BRAND_META[factory.brand];

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUid(data?.user?.id ?? null), () => {});
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('list_factory_comments', { p_factory_id: factory.id, p_limit: 50 }).then((r) => r, () => ({ data: null }));
      const list = (data ?? []) as FactoryComment[];
      if (cancelled) return;
      setComments(list);
      const ids = list.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
      if (ids.length > 0) {
        const { data: aw } = await supabase.from('mlbg_award_log').select('ref_id, earned')
          .eq('kind', 'factory_comment').in('ref_id', ids);
        const m: Record<number, number> = {};
        for (const r of (aw ?? []) as Array<{ ref_id: number | string; earned: number | string }>) m[Number(r.ref_id)] = Number(r.earned);
        if (!cancelled) setEarnedMap(m);
      }
    })();
    return () => { cancelled = true; };
  }, [factory.id, supabase]);

  const isMine = !!factory.occupier_id && factory.occupier_id === currentUid;
  const ownerLabel = (factory.brand === 'union' || factory.brand === 'cargo') ? '위원장' : '사장';
  const lastClaimMs = factory.last_claimed_at ? new Date(factory.last_claimed_at).getTime()
    : (factory.occupied_at ? new Date(factory.occupied_at).getTime() : null);
  const daysOwed = lastClaimMs ? Math.floor((Date.now() - lastClaimMs) / 86400000) : 0;
  const totalDays = factory.occupied_at ? Math.floor((Date.now() - new Date(factory.occupied_at).getTime()) / 86400000) : 0;
  const totalEarned = totalDays * factory.daily_income;
  const owedAmount = daysOwed * factory.daily_income;
  const breakeven = factory.daily_income > 0 ? Math.ceil(factory.occupy_price / factory.daily_income) : 0;

  async function occupy() {
    if (busy) return;
    if (factory.occupier_id) { alert(`이미 ${factory.occupier_name ?? '다른 사람'} 님이 보유 중`); return; }
    if (!confirm(`${factory.name}\n${factory.occupy_price.toLocaleString()} mlbg 로 분양받습니다.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('occupy_factory', { p_factory_id: factory.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null; out_paid: number } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '분양 실패'); return; }
    alert(`${factory.name} 분양 완료. ${factory.occupy_price.toLocaleString()} mlbg 차감.`);
    notifyTelegram('factory_occupy', factory.id);
    onChanged(); onClose(); router.refresh();
  }

  async function claim() {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('claim_factory_income', { p_factory_id: factory.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_earned: number; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '청구 실패'); return; }
    alert(`+${row.out_earned} mlbg 수익 청구 완료.`);
    onChanged(); router.refresh();
  }

  async function release() {
    if (busy) return;
    if (!confirm(`보유 해제 시 ${factory.occupy_price.toLocaleString()} mlbg 환불받습니다. 진행할까요?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('release_factory', { p_factory_id: factory.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null; out_refund: number } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '해제 실패'); return; }
    alert(`해제 완료. ${row.out_refund.toLocaleString()} mlbg 환불.`);
    onChanged(); onClose(); router.refresh();
  }

  async function listForSale() {
    const price = Number(sellPriceInput);
    if (!Number.isFinite(price) || price <= 0) { alert('가격을 0보다 큰 숫자로 입력하세요.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('list_factory_for_sale', { p_factory_id: factory.id, p_price: price, p_description: sellDescInput.trim() || null });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '매도 등록 실패'); return; }
    alert(`매도 등록: ${price.toLocaleString()} mlbg`);
    setSellPanelOpen(false); setSellPriceInput(''); setSellDescInput('');
    onChanged(); router.refresh();
  }

  async function unlist() {
    if (!confirm('매도 해제할까요?')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('unlist_factory', { p_factory_id: factory.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '해제 실패'); return; }
    onChanged(); router.refresh();
  }

  async function buyListing() {
    if (factory.listing_price == null) return;
    if (!confirm(`${factory.name}\n${factory.listing_price.toLocaleString()} mlbg 에 매수합니다.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('buy_factory', { p_factory_id: factory.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null; out_price: number } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '매수 실패'); return; }
    alert(`매수 완료: ${row.out_price.toLocaleString()} mlbg`);
    notifyTelegram('factory_occupy', factory.id);
    onChanged();
    router.refresh();
  }

  async function postComment() {
    const txt = commentInput.trim();
    if (!txt || busy) return;
    setBusy(true);
    const { data: ins, error } = await supabase.from('factory_comments').insert({ factory_id: factory.id, author_id: currentUid, content: txt }).select('id').single();
    setBusy(false);
    if (error) { alert(error.message); return; }
    setCommentInput('');
    if (ins?.id) await awardMlbg('factory_comment', ins.id, txt);
    const { data } = await supabase.rpc('list_factory_comments', { p_factory_id: factory.id, p_limit: 50 }).then((r) => r, () => ({ data: null }));
    setComments((data ?? []) as FactoryComment[]);
  }

  async function deleteComment(id: number) {
    if (!confirm('댓글을 삭제할까요?')) return;
    const { error } = await supabase.from('factory_comments').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <>
      <div className="fixed inset-0 z-[170] bg-black/40" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-[180] w-[420px] max-w-[100vw] h-screen bg-white border-l border-border shadow-[-8px_0_32px_rgba(0,0,0,0.15)] flex flex-col">
        <div className="px-5 py-4 flex items-center gap-3 flex-shrink-0" style={{ background: meta.bg }}>
          <img src={meta.pin} alt="" className="w-9 h-12 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold tracking-widest uppercase text-white/80 mb-0.5">{meta.label}</div>
            <h1 className="text-[18px] font-bold text-white truncate">{factory.name}</h1>
            {factory.address && <div className="text-[11px] text-white/80 truncate">{factory.address}</div>}
          </div>
          <button type="button" onClick={onClose} className="text-white/90 hover:text-white text-[20px] leading-none px-1 cursor-pointer bg-transparent border-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="border-2 px-4 py-4 mb-3" style={{ borderColor: meta.bg, background: meta.iconBg }}>
            {factory.occupier_id ? (
              <>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[13px] font-bold text-muted">{ownerLabel}</span>
                  <span className="text-[20px] font-bold text-navy truncate">{factory.occupier_name ?? '익명'}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[13px] font-bold text-muted">누적 수익</span>
                  <span className="text-[22px] font-black text-cyan tabular-nums">{totalEarned.toLocaleString()} <span className="text-[13px] text-muted">mlbg</span></span>
                </div>
                {isMine && (
                  <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-black/10">
                    <span className="text-[13px] font-bold text-[#dc2626]">청구 가능</span>
                    <span className="text-[20px] font-black text-[#dc2626] tabular-nums">{owedAmount.toLocaleString()} <span className="text-[13px]">mlbg</span></span>
                  </div>
                )}
                {factory.occupied_at && <div className="text-[13px] text-muted mt-2">분양일: {fmtKstShort(factory.occupied_at)}</div>}
              </>
            ) : (
              <>
                <div className="text-[10px] tracking-widest uppercase text-muted mb-1">분양가</div>
                <div className="text-[28px] font-black tabular-nums text-navy">{factory.occupy_price.toLocaleString()} <span className="text-[14px] text-muted">mlbg</span></div>
                <div className="text-[11px] text-muted mt-2">매일 {factory.daily_income} mlbg 자동 수익 · <b className="text-navy">{breakeven}일이면 회수</b></div>
              </>
            )}
          </div>

          <div className="border-l-4 border-cyan bg-cyan/5 px-4 py-3 mb-4">
            <div className="text-[12px] font-bold text-navy mb-1">💰 매일 {factory.daily_income} mlbg 자동 수익</div>
            <div className="text-[11px] text-muted leading-relaxed">24시간마다 +{factory.daily_income} 누적. {ownerLabel}이 직접 청구.</div>
          </div>

          <div className="grid gap-2 mb-4">
            {isMine ? (
              <>
                <button type="button" onClick={claim} disabled={busy || daysOwed < 1}
                  className="bg-cyan text-navy border-none px-4 py-2.5 text-[13px] font-black tracking-wide hover:bg-cyan/80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  {daysOwed >= 1 ? `수익 청구 (+${owedAmount.toLocaleString()} mlbg)` : '아직 24시간 안 지남'}
                </button>
                <button type="button" onClick={release} disabled={busy}
                  className="bg-white border border-border text-text px-4 py-2 text-[12px] font-bold hover:border-red-500 hover:text-red-600 disabled:opacity-50 cursor-pointer">
                  보유 해제 ({factory.occupy_price.toLocaleString()} mlbg 환불)
                </button>
              </>
            ) : !factory.occupier_id ? (
              <button type="button" onClick={occupy} disabled={busy}
                className="text-white border-none px-4 py-2.5 text-[13px] font-black tracking-wide hover:opacity-90 disabled:opacity-50 cursor-pointer"
                style={{ background: meta.bg }}>
                분양받기 ({factory.occupy_price.toLocaleString()} mlbg)
              </button>
            ) : (
              <div className="bg-bg/50 border border-border px-4 py-2.5 text-[12px] text-muted text-center">분양 마감</div>
            )}
          </div>

          {factory.listing_price != null && (
            <div className="border-2 border-[#dc2626] bg-[#fef2f2] px-4 py-3 mb-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-[10px] tracking-widest uppercase text-[#dc2626]">매도 중</span>
                <span className="text-[20px] font-black text-[#dc2626] tabular-nums">{Number(factory.listing_price).toLocaleString()} <span className="text-[12px]">mlbg</span></span>
              </div>
              {factory.listing_description && <div className="text-[11px] text-muted mb-2 whitespace-pre-wrap">{factory.listing_description}</div>}
              {isMine ? (
                <button type="button" onClick={unlist} disabled={busy} className="w-full bg-white border border-border text-text px-4 py-2 text-[12px] font-bold hover:border-red-500 hover:text-red-600 disabled:opacity-50 cursor-pointer">매도 해제</button>
              ) : (
                <button type="button" onClick={buyListing} disabled={busy} className="w-full bg-[#dc2626] text-white border-none px-4 py-2.5 text-[13px] font-black tracking-wide hover:bg-[#b91c1c] disabled:opacity-50 cursor-pointer">즉시 매수</button>
              )}
            </div>
          )}

          {isMine && factory.listing_price == null && (
            <div className="border border-border px-4 py-3 mb-4">
              {!sellPanelOpen ? (
                <button type="button" onClick={() => setSellPanelOpen(true)} className="w-full bg-white border border-border text-navy px-4 py-2 text-[12px] font-bold hover:border-navy cursor-pointer">매도 등록</button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input type="number" value={sellPriceInput} onChange={(e) => setSellPriceInput(e.target.value)} placeholder="매도가 (mlbg)" min={1}
                    className="w-full px-3 py-2 border border-border focus:border-navy text-[13px] tabular-nums outline-none rounded-none" />
                  <textarea value={sellDescInput} onChange={(e) => setSellDescInput(e.target.value)} placeholder="매물 설명 (선택)" rows={2}
                    className="w-full px-3 py-2 border border-border focus:border-navy text-[12px] outline-none rounded-none resize-none" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setSellPanelOpen(false); setSellPriceInput(''); setSellDescInput(''); }} className="flex-1 bg-white border border-border text-text px-3 py-1.5 text-[12px] font-bold hover:border-navy cursor-pointer">취소</button>
                    <button type="button" onClick={listForSale} disabled={busy || !sellPriceInput.trim()} className="flex-1 bg-navy text-white border-none px-3 py-1.5 text-[12px] font-bold hover:bg-navy-dark disabled:opacity-50 cursor-pointer">{busy ? '...' : '등록'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border border-border">
            <div className="px-4 py-2 border-b border-border bg-bg/30 text-[12px] font-bold text-navy">💬 댓글 ({comments.length})</div>
            <div className="max-h-[260px] overflow-y-auto">
              {comments.length === 0 ? (
                <div className="px-4 py-6 text-[11px] text-muted text-center">첫 댓글을 남겨보세요.</div>
              ) : (
                <ul>
                  {comments.map((c) => (
                    <li key={c.id} className="px-4 py-2 border-b border-[#f0f0f0] last:border-b-0">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <span className="text-[12px] font-bold text-navy">{c.author_name ?? '익명'}</span>
                        <span className="text-[10px] text-muted tabular-nums flex items-center gap-2">
                          {(() => {
                            const e = earnedMap[Number(c.id)];
                            return typeof e === 'number' && e > 0 ? <RewardTooltip earned={e} kind="factory_comment" /> : null;
                          })()}
                          <span>{fmtKstShort(c.created_at)}</span>
                        </span>
                      </div>
                      <div className="text-[12px] text-text whitespace-pre-wrap break-words">{c.content}</div>
                      {currentUid && currentUid === c.author_id && (
                        <button type="button" onClick={() => deleteComment(c.id)} className="mt-1 text-[10px] text-muted hover:text-red-600 bg-transparent border-none p-0 cursor-pointer">삭제</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {currentUid ? (
              <div className="px-3 py-2 border-t border-border flex gap-2">
                <input type="text" value={commentInput} onChange={(e) => setCommentInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') postComment(); }}
                  placeholder="댓글..." maxLength={500}
                  className="flex-1 px-2 py-1.5 border border-border focus:border-navy text-[12px] outline-none rounded-none" />
                <button type="button" onClick={postComment} disabled={busy || !commentInput.trim()} className="bg-navy text-white border-none px-3 py-1.5 text-[12px] font-bold hover:bg-navy-dark disabled:opacity-40 cursor-pointer">등록</button>
              </div>
            ) : (
              <div className="px-4 py-3 border-t border-border text-[11px] text-muted text-center">로그인하면 댓글 작성 가능</div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
