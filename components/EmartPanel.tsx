'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifyTelegram } from '@/lib/telegram-notify';
import { awardMlbg } from '@/lib/mlbg-award';
import { revalidateHome } from '@/lib/revalidate-home';
import { checkAndPayBridgeToll } from '@/lib/bridge-toll';
import RewardTooltip from './RewardTooltip';

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
  listing_price?: number | null;
  listing_description?: string | null;
};

type EmartComment = { id: number; author_id: string; author_name: string | null; content: string; created_at: string };

type Props = {
  emart: EmartItem;
  onClose: () => void;
  onChanged: () => void; // 분양/청구 후 부모 list 재조회
  inline?: boolean;
};

function fmtKstShort(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function EmartPanel({ emart, onClose, onChanged, inline = false }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // 매도 등록 폼
  const [sellPriceInput, setSellPriceInput] = useState('');
  const [sellDescInput, setSellDescInput] = useState('');
  const [sellPanelOpen, setSellPanelOpen] = useState(false);

  // 댓글
  const [comments, setComments] = useState<EmartComment[]>([]);
  const [earnedMap, setEarnedMap] = useState<Record<number, number>>({});
  const [commentInput, setCommentInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setCurrentUid(user?.id ?? null);
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
        if (!cancelled) setIsAdmin(!!(prof as { is_admin?: boolean } | null)?.is_admin);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // 파업 — 어드민이 점거자 잔액에서 % 차감
  async function handleStrike() {
    if (busy) return;
    if (!emart.occupier_id) { alert('점거자가 없는 매장은 파업 못 함'); return; }
    const pctInput = window.prompt(`${emart.name} 점거자 잔액의 몇 % 를 차감할까요? (빈 값 = 기본값 사용)`, '');
    if (pctInput === null) return;
    const pct = pctInput.trim() === '' ? null : Number(pctInput);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) { alert('0~100 사이 숫자'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('strike_asset', { p_asset_type: 'emart', p_asset_id: emart.id, p_pct: pct });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_loss_pct: number; out_loss_mlbg: number; out_occupier_name: string | null; out_event_id: number | null; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '파업 실패'); return; }
    alert(`💥 파업 완료 — ${row.out_occupier_name ?? '점거자'} 님 ${Number(row.out_loss_pct)}% (${Number(row.out_loss_mlbg).toLocaleString()} mlbg) 차감`);
    if (row.out_event_id) notifyTelegram('strike', row.out_event_id);
    revalidateHome();
    onChanged();
    router.refresh();
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('list_emart_comments', { p_emart_id: emart.id, p_limit: 50 }).then((r) => r, () => ({ data: null }));
      const list = (data ?? []) as EmartComment[];
      if (cancelled) return;
      setComments(list);
      const ids = list.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
      if (ids.length > 0) {
        const { data: aw } = await supabase.from('mlbg_award_log').select('ref_id, earned')
          .eq('kind', 'emart_comment').in('ref_id', ids);
        const m: Record<number, number> = {};
        for (const r of (aw ?? []) as Array<{ ref_id: number | string; earned: number | string }>) m[Number(r.ref_id)] = Number(r.earned);
        if (!cancelled) setEarnedMap(m);
      }
    })();
    return () => { cancelled = true; };
  }, [emart.id, supabase]);

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
    onChanged();   // 패널 즉시 사장 정보로 갱신
    revalidateHome();
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
    revalidateHome();
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
    revalidateHome();
    router.refresh();
  }

  async function listForSale() {
    if (busy) return;
    const price = Number(sellPriceInput);
    if (!Number.isFinite(price) || price <= 0) { alert('가격을 0보다 큰 숫자로 입력하세요.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('list_emart_for_sale', { p_emart_id: emart.id, p_price: price, p_description: sellDescInput.trim() || null });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '매도 등록 실패'); return; }
    alert(`매도 등록 완료: ${price.toLocaleString()} mlbg`);
    setSellPanelOpen(false);
    setSellPriceInput('');
    setSellDescInput('');
    onChanged();
    revalidateHome();
    router.refresh();
  }

  async function unlist() {
    if (busy) return;
    if (!confirm('매도 등록을 해제할까요?')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('unlist_emart', { p_emart_id: emart.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '해제 실패'); return; }
    onChanged();
    revalidateHome();
    router.refresh();
  }

  async function buyListing() {
    if (busy) return;
    if (emart.listing_price == null) return;
    if (!confirm(`${emart.name}\n${Number(emart.listing_price).toLocaleString()} mlbg 에 매수합니다. 진행할까요?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('buy_emart', { p_emart_id: emart.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null; out_price: number } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '매수 실패'); return; }
    alert(`매수 완료: ${Number(row.out_price).toLocaleString()} mlbg`);
    notifyTelegram('emart_occupy', emart.id);
    onChanged();
    onClose();
    revalidateHome();
    router.refresh();
  }

  async function postComment() {
    const txt = commentInput.trim();
    if (!txt || busy) return;
    // 다리 통행료 사전 검사 (한강 횡단 시)
    const tollOk = await checkAndPayBridgeToll(emart.lat, emart.lng);
    if (!tollOk.ok) {
      if (tollOk.message) alert(tollOk.message);
      return;
    }
    setBusy(true);
    const { data: ins, error } = await supabase.from('emart_comments').insert({ emart_id: emart.id, author_id: currentUid, content: txt }).select('id').single();
    setBusy(false);
    if (error) { alert(error.message); return; }
    setCommentInput('');
    if (ins?.id) await awardMlbg('emart_comment', ins.id, txt);
    const { data } = await supabase.rpc('list_emart_comments', { p_emart_id: emart.id, p_limit: 50 }).then((r) => r, () => ({ data: null }));
    setComments((data ?? []) as EmartComment[]);
    revalidateHome();
  }

  async function deleteComment(id: number) {
    if (!confirm('댓글을 삭제할까요?')) return;
    const { error } = await supabase.from('emart_comments').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setComments((prev) => prev.filter((c) => c.id !== id));
    revalidateHome();
  }

  return (
    <>
      {!inline && <div className="fixed inset-0 z-[170] bg-black/40" onClick={onClose} />}
      <aside className={inline
        ? 'block w-full bg-white flex flex-col'
        : 'fixed top-0 right-0 z-[180] w-[420px] max-w-[100vw] h-screen bg-white border-l border-border shadow-[-8px_0_32px_rgba(0,0,0,0.15)] flex flex-col'}>
        {/* 헤더 — 노란 바 */}
        <div className="bg-[#F5A623] px-5 py-4 flex items-center gap-3 flex-shrink-0">
          <img src="/pins/emart.svg" alt="" className="w-9 h-12 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold tracking-widest uppercase text-white/80 mb-0.5">EMART · 이마트 분양</div>
            <h1 className="text-[18px] font-bold text-white inline-flex items-center gap-1.5">
              <span className="truncate">{emart.name}</span>
              <a href={`/?emart=${emart.id}`} aria-label="지도에서 위치 보기" title="지도에서 위치 보기" className="text-white/80 hover:text-white inline-flex items-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </a>
            </h1>
            {emart.address && <div className="text-[11px] text-white/80 truncate">{emart.address}</div>}
          </div>
          {/* 어드민 — 파업 버튼. 점거자 있을 때만 활성. */}
          {isAdmin && emart.occupier_id && (
            <button
              type="button"
              onClick={handleStrike}
              disabled={busy}
              title="점거자에게 손실 부여"
              className="text-[10px] font-bold tracking-wider uppercase bg-[#dc2626] hover:bg-[#b91c1c] text-white px-2 py-1 cursor-pointer border-none disabled:opacity-50 flex-shrink-0"
            >
              💥 파업
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={inline ? '뒤로' : '닫기'} className="text-white/90 hover:text-white px-1 cursor-pointer bg-transparent border-none flex items-center justify-center">
            {inline ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            ) : <span className="text-[20px] leading-none">✕</span>}
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 사장 + 수익 카드 */}
          <div className="border-2 border-[#F5A623] bg-[#fffaf0] px-4 py-4 mb-3">
            {emart.occupier_id ? (
              <>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[13px] font-bold text-muted">사장</span>
                  <span className="text-[20px] font-bold text-navy truncate">{emart.occupier_name ?? '익명'}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <span className="text-[13px] font-bold text-muted">누적 수익</span>
                  <span className="text-[22px] font-black text-cyan tabular-nums">{totalDays} <span className="text-[13px] text-muted">mlbg</span></span>
                </div>
                {isMine && (
                  <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-[#F5A623]/30">
                    <span className="text-[13px] font-bold text-[#dc2626]">청구 가능</span>
                    <span className="text-[20px] font-black text-[#dc2626] tabular-nums">{daysOwed} <span className="text-[13px]">mlbg</span></span>
                  </div>
                )}
                {emart.occupied_at && (
                  <div className="text-[13px] text-muted mt-2">
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

          {/* 매도 등록된 경우 — 누구나 즉시 매수 (본인 제외) */}
          {emart.listing_price != null && (
            <div className="border-2 border-[#dc2626] bg-[#fef2f2] px-4 py-3 mb-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="text-[10px] tracking-widest uppercase text-[#dc2626]">매도 중</span>
                <span className="text-[20px] font-black text-[#dc2626] tabular-nums">{Number(emart.listing_price).toLocaleString()} <span className="text-[12px]">mlbg</span></span>
              </div>
              {emart.listing_description && (
                <div className="text-[11px] text-muted mb-2 whitespace-pre-wrap">{emart.listing_description}</div>
              )}
              {isMine ? (
                <button type="button" onClick={unlist} disabled={busy} className="w-full bg-white border border-border text-text px-4 py-2 text-[12px] font-bold hover:border-red-500 hover:text-red-600 disabled:opacity-50 cursor-pointer">매도 해제</button>
              ) : (
                <button type="button" onClick={buyListing} disabled={busy} className="w-full bg-[#dc2626] text-white border-none px-4 py-2.5 text-[13px] font-black tracking-wide hover:bg-[#b91c1c] disabled:opacity-50 cursor-pointer">즉시 매수</button>
              )}
            </div>
          )}

          {/* 본인 보유 + 매도 안 된 경우 — 매도 등록 */}
          {isMine && emart.listing_price == null && (
            <div className="border border-border px-4 py-3 mb-4">
              {!sellPanelOpen ? (
                <button type="button" onClick={() => setSellPanelOpen(true)} className="w-full bg-white border border-border text-navy px-4 py-2 text-[12px] font-bold hover:border-navy cursor-pointer">매도 등록</button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="number"
                    value={sellPriceInput}
                    onChange={(e) => setSellPriceInput(e.target.value)}
                    placeholder="매도가 (mlbg)"
                    min={1}
                    className="w-full px-3 py-2 border border-border focus:border-navy text-[13px] tabular-nums outline-none rounded-none"
                  />
                  <textarea
                    value={sellDescInput}
                    onChange={(e) => setSellDescInput(e.target.value)}
                    placeholder="매물 설명 (선택, 1000자 이내)"
                    rows={2}
                    className="w-full px-3 py-2 border border-border focus:border-navy text-[12px] outline-none rounded-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setSellPanelOpen(false); setSellPriceInput(''); setSellDescInput(''); }} className="flex-1 bg-white border border-border text-text px-3 py-1.5 text-[12px] font-bold hover:border-navy cursor-pointer">취소</button>
                    <button type="button" onClick={listForSale} disabled={busy || !sellPriceInput.trim()} className="flex-1 bg-navy text-white border-none px-3 py-1.5 text-[12px] font-bold hover:bg-navy-dark disabled:opacity-50 cursor-pointer">{busy ? '...' : '등록'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 댓글 */}
          <div className="border border-border">
            <div className="px-4 py-2 border-b border-border bg-bg/30 text-[12px] font-bold text-navy">💬 매장 댓글 ({comments.length})</div>
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
                            return typeof e === 'number' && e > 0 ? <RewardTooltip earned={e} kind="emart_comment" /> : null;
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
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') postComment(); }}
                  placeholder="댓글 남기기..."
                  maxLength={500}
                  className="flex-1 px-2 py-1.5 border border-border focus:border-navy text-[12px] outline-none rounded-none"
                />
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
