'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { notifyTelegram } from '@/lib/telegram-notify';

type Comment = {
  id: number;
  apt_id: number;
  author_id: string | null;
  content: string;
  created_at: string;
  author?: { display_name: string | null } | null;
};

type Offer = {
  id: number;
  apt_id: number;
  buyer_id: string;
  seller_id: string;
  price: number;
  kind: 'offer' | 'snatch';
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'superseded';
  created_at: string;
  buyer_name?: string | null;
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

export default function ListingInteractions({
  aptId,
  userId,
  isOwner,
  listingPrice,
  listingDescription,
  onTradeExecuted,
}: {
  aptId: number;
  userId: string | null;
  isOwner: boolean;
  listingPrice: number | null;
  listingDescription?: string | null;
  /** 거래 체결되어 점거 이전됐을 때 패널 reload 트리거용 */
  onTradeExecuted?: () => void;
}) {
  const supabase = createClient();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);

  // 댓글 입력
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  // 호가 입력
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerMsg, setOfferMsg] = useState('');
  const [snatchMsg, setSnatchMsg] = useState('');
  const [offerKind, setOfferKind] = useState<'offer' | 'snatch'>('offer');
  const [offerBusy, setOfferBusy] = useState(false);

  async function load() {
    // 댓글
    const { data: cData } = await supabase
      .from('apt_listing_comments')
      .select('id, apt_id, author_id, content, created_at')
      .eq('apt_id', aptId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
      .then((r) => r, () => ({ data: null }));
    const cList = (cData ?? []) as Comment[];
    const authorIds = Array.from(new Set(cList.map((c) => c.author_id).filter(Boolean) as string[]));
    if (authorIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', authorIds);
      const map = new Map<string, string>();
      for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name) map.set(p.id, p.display_name);
      }
      for (const c of cList) {
        if (c.author_id) c.author = { display_name: map.get(c.author_id) ?? null };
      }
    }
    setComments(cList);

    // 호가 (RLS: buyer 또는 seller 만 조회 가능. 본인 관련된 것만 보임)
    if (userId) {
      const { data: oData } = await supabase
        .from('apt_listing_offers')
        .select('id, apt_id, buyer_id, seller_id, price, kind, message, status, created_at')
        .eq('apt_id', aptId)
        .order('created_at', { ascending: false })
        .limit(50)
        .then((r) => r, () => ({ data: null }));
      const oList = (oData ?? []) as Offer[];
      const buyerIds = Array.from(new Set(oList.map((o) => o.buyer_id).filter(Boolean)));
      if (buyerIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', buyerIds);
        const map = new Map<string, string>();
        for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
          if (p.display_name) map.set(p.id, p.display_name);
        }
        for (const o of oList) o.buyer_name = map.get(o.buyer_id) ?? null;
      }
      setOffers(oList);
    } else {
      setOffers([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptId, userId]);

  async function submitComment() {
    if (!userId) { alert('로그인이 필요해요.'); return; }
    const text = commentText.trim();
    if (!text) return;
    setCommentBusy(true);
    const { data, error } = await supabase.rpc('add_listing_comment', { p_apt_id: aptId, p_content: text });
    setCommentBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '댓글 등록 실패'); return; }
    setCommentText('');
    await load();
  }

  async function deleteComment(id: number) {
    if (!confirm('댓글을 삭제할까요?')) return;
    const { data, error } = await supabase.rpc('delete_listing_comment', { p_id: id });
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '삭제 실패'); return; }
    await load();
  }

  async function submitOffer(kind: 'offer' | 'snatch') {
    if (!userId) { alert('로그인이 필요해요.'); return; }
    const msg = (kind === 'offer' ? offerMsg : snatchMsg).trim();
    let price = 0;
    if (kind === 'offer') {
      price = Number(offerPrice);
      if (!Number.isFinite(price) || price <= 0) { alert('호가는 0보다 큰 숫자로 입력하세요.'); return; }
    }
    if (kind === 'snatch') {
      if (!confirm('이 단지를 무상으로 받겠다고 매도자에게 요청합니다. (내놔)')) return;
    }
    setOfferBusy(true);
    const { data, error } = await supabase.rpc('make_offer', {
      p_apt_id: aptId,
      p_price: price,
      p_kind: kind,
      p_message: msg || null,
    });
    setOfferBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '호가 실패'); return; }
    const offerId = (Array.isArray(data) ? data[0] : data) as { out_id?: number } | undefined;
    setOfferOpen(false);
    setOfferPrice('');
    setOfferMsg('');
    setSnatchMsg('');
    alert(kind === 'snatch' ? '내놔 요청 보냄. 매도자 결정을 기다리세요.' : '매수 호가 보냄. 매도자가 수락하면 즉시 거래.');
    // 텔레그램 채널 알림 — 다른 회원이 보고 끼어들 수 있도록
    if (offerId?.out_id) notifyTelegram(kind, offerId.out_id);
    await load();
  }

  async function acceptOffer(id: number, kind: 'offer' | 'snatch', price: number) {
    const msg = kind === 'snatch'
      ? '이 단지를 무상으로 넘깁니다. 정말 진행할까요?'
      : `${price.toLocaleString()} mlbg 에 매도합니다. 진행할까요?`;
    if (!confirm(msg)) return;
    const { data, error } = await supabase.rpc('accept_offer', { p_offer_id: id });
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '수락 실패'); return; }
    alert('거래 체결 완료.');
    onTradeExecuted?.();
    window.dispatchEvent(new Event('mlbg-pins-changed'));
    await load();
  }

  async function rejectOffer(id: number) {
    if (!confirm('이 호가를 거절할까요?')) return;
    const { data, error } = await supabase.rpc('reject_offer', { p_offer_id: id });
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '거절 실패'); return; }
    await load();
  }

  async function cancelOffer(id: number) {
    if (!confirm('내가 보낸 호가를 취소할까요?')) return;
    const { data, error } = await supabase.rpc('cancel_offer', { p_offer_id: id });
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '취소 실패'); return; }
    await load();
  }

  const pendingOffers = (offers ?? []).filter((o) => o.status === 'pending');
  const myPending = pendingOffers.filter((o) => o.buyer_id === userId);
  const receivedPending = isOwner ? pendingOffers.filter((o) => o.seller_id === userId) : [];

  return (
    <div className="mt-3 border border-cyan/40 bg-white">
      {/* 매물 헤더 — 호가 + 설명 (있을 때만) */}
      {listingPrice != null && (
        <div className="px-3 py-2 bg-cyan/10 border-b border-cyan/30">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-navy font-medium">매물 등록됨</span>
            <span className="text-[13px] font-bold text-navy tabular-nums">{listingPrice.toLocaleString()} mlbg</span>
          </div>
          {listingDescription && (
            <div className="mt-1.5 pt-1.5 border-t border-cyan/20 text-[11px] text-text leading-relaxed whitespace-pre-wrap">
              {listingDescription}
            </div>
          )}
        </div>
      )}

      {/* 받은 호가 (매도자 시점) */}
      {isOwner && receivedPending.length > 0 && (
        <div className="border-b border-cyan/30 bg-cyan/5">
          <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase text-navy">
            받은 호가 {receivedPending.length}건
          </div>
          <ul className="border-t border-cyan/20">
            {receivedPending.map((o) => (
              <li key={o.id} className="px-3 py-2 border-b border-cyan/20 last:border-b-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 text-[12px] min-w-0">
                    <span className={`text-[9px] font-bold tracking-wider px-1 py-px ${o.kind === 'snatch' ? 'bg-[#fef3c7] text-[#78350f]' : 'bg-cyan text-white'}`}>
                      {o.kind === 'snatch' ? '내놔' : '매수'}
                    </span>
                    <Link href={`/u/${o.buyer_id}`} className="text-text font-bold hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                      {o.buyer_name ?? '익명'}
                    </Link>
                    <span className="text-muted">·</span>
                    <span className="font-bold text-navy tabular-nums flex-shrink-0">
                      {o.kind === 'snatch' ? '0 mlbg (무상)' : `${Number(o.price).toLocaleString()} mlbg`}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted flex-shrink-0">{relTime(o.created_at)}</span>
                </div>
                {o.message && <div className="text-[11px] text-text leading-snug whitespace-pre-wrap mb-1.5">{o.message}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => rejectOffer(o.id)}
                    className="text-[11px] text-muted hover:text-red-600 bg-transparent border-none p-0">거절</button>
                  <button type="button" onClick={() => acceptOffer(o.id, o.kind, Number(o.price))}
                    className="text-[11px] font-bold px-3 py-1 bg-navy text-white hover:bg-navy-dark">수락</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 내가 보낸 호가 (매수자 시점) */}
      {!isOwner && userId && myPending.length > 0 && (
        <div className="border-b border-cyan/30">
          <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase text-muted">
            내가 보낸 호가 {myPending.length}건 (대기중)
          </div>
          <ul className="border-t border-cyan/20">
            {myPending.map((o) => (
              <li key={o.id} className="px-3 py-1.5 border-b border-cyan/20 last:border-b-0 flex items-center justify-between gap-2 text-[12px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-[9px] font-bold tracking-wider px-1 py-px ${o.kind === 'snatch' ? 'bg-[#fef3c7] text-[#78350f]' : 'bg-cyan/15 text-cyan'}`}>
                    {o.kind === 'snatch' ? '내놔' : '매수'}
                  </span>
                  <span className="font-bold text-navy tabular-nums">
                    {o.kind === 'snatch' ? '0 mlbg' : `${Number(o.price).toLocaleString()} mlbg`}
                  </span>
                  <span className="text-muted text-[10px]">· {relTime(o.created_at)}</span>
                </div>
                <button type="button" onClick={() => cancelOffer(o.id)}
                  className="text-[11px] text-muted hover:text-red-600 bg-transparent border-none p-0">취소</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 매수 호가 / 내놔 폼 (비점거자 + 로그인 시) */}
      {!isOwner && userId && (
        <div className="border-b border-cyan/30">
          {!offerOpen ? (
            <div className="flex">
              <button type="button"
                onClick={() => { setOfferOpen(true); setOfferKind('offer'); }}
                className="flex-1 text-[12px] py-2 border-r border-cyan/30 bg-white text-navy hover:bg-cyan/10 font-medium">
                매수 호가 제시
              </button>
              <button type="button"
                onClick={() => { setOfferOpen(true); setOfferKind('snatch'); }}
                className="flex-1 text-[12px] py-2 bg-red-500 text-white hover:bg-red-600 font-bold">
                내놔 (무상 요청)
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-2 bg-bg/30">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOfferKind('offer')}
                  className={`text-[11px] font-bold px-2 py-1 ${offerKind === 'offer' ? 'bg-navy text-white' : 'bg-white border border-border text-text'}`}>
                  매수 호가
                </button>
                <button type="button" onClick={() => setOfferKind('snatch')}
                  className={`text-[11px] font-bold px-2 py-1 ${offerKind === 'snatch' ? 'bg-red-500 text-white' : 'bg-white border border-border text-text'}`}>
                  내놔 (무상)
                </button>
                <button type="button" onClick={() => setOfferOpen(false)}
                  className="ml-auto text-[11px] text-muted hover:text-text bg-transparent border-none p-0">닫기</button>
              </div>
              {offerKind === 'offer' ? (
                <>
                  <input type="number" min="1" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)}
                    placeholder="제시 가격 (mlbg)"
                    className="w-full border border-border px-2 py-1.5 text-[12px] outline-none focus:border-navy" />
                  <textarea value={offerMsg} onChange={(e) => setOfferMsg(e.target.value)} maxLength={500} rows={2}
                    placeholder="매도자에게 한마디 (선택)"
                    className="w-full border border-border px-2 py-1.5 text-[12px] outline-none focus:border-navy resize-none" />
                  <button type="button" onClick={() => submitOffer('offer')} disabled={offerBusy || !offerPrice}
                    className="w-full text-[12px] font-bold py-2 bg-navy text-white hover:bg-navy-dark disabled:opacity-40">
                    {offerBusy ? '...' : '매수 호가 보내기'}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-[11px] text-muted leading-snug">
                    내놔는 매도자에게 무상으로 넘겨달라고 요청하는 거예요. 매도자가 수락하면 mlbg 지불 없이 단지가 이전돼요. 거절하면 끝.
                  </div>
                  <textarea value={snatchMsg} onChange={(e) => setSnatchMsg(e.target.value)} maxLength={500} rows={2}
                    placeholder="왜 무상으로 받고 싶은지 — 설득력 있게 (선택)"
                    className="w-full border border-border px-2 py-1.5 text-[12px] outline-none focus:border-navy resize-none" />
                  <button type="button" onClick={() => submitOffer('snatch')} disabled={offerBusy}
                    className="w-full text-[12px] font-bold py-2 bg-red-500 text-white hover:bg-red-600 disabled:opacity-40">
                    {offerBusy ? '...' : '내놔 요청 보내기'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 매물 댓글 */}
      <div>
        <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase text-muted">
          매물 댓글 {comments?.length ?? 0}
        </div>
        {userId && (
          <div className="px-3 pb-2 flex items-start gap-2">
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
              maxLength={1000} rows={2}
              placeholder="매물에 댓글 남기기..."
              className="flex-1 border border-border px-2 py-1 text-[12px] outline-none focus:border-navy resize-none leading-snug" />
            <button type="button" onClick={submitComment} disabled={commentBusy || !commentText.trim()}
              className="text-[11px] font-bold px-3 py-2 bg-navy text-white hover:bg-navy-dark disabled:opacity-40 flex-shrink-0">
              {commentBusy ? '...' : '등록'}
            </button>
          </div>
        )}
        {comments === null ? (
          <div className="px-3 py-3 text-[11px] text-muted text-center border-t border-cyan/20">불러오는 중...</div>
        ) : comments.length === 0 ? (
          <div className="px-3 py-3 text-[11px] text-muted text-center border-t border-cyan/20">첫 댓글을 남겨보세요.</div>
        ) : (
          <ul className="max-h-[280px] overflow-y-auto border-t border-cyan/20">
            {comments.map((c) => {
              const isMine = userId && c.author_id === userId;
              return (
                <li key={c.id} className="px-3 py-2 border-b border-cyan/15 last:border-b-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted mb-0.5">
                    {c.author_id ? (
                      <Link href={`/u/${c.author_id}`} className="text-text font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.author?.display_name ?? '익명'}
                      </Link>
                    ) : (
                      <span className="text-text font-bold">{c.author?.display_name ?? '익명'}</span>
                    )}
                    <span>·</span>
                    <span>{relTime(c.created_at)}</span>
                    {isMine && (
                      <>
                        <span>·</span>
                        <button type="button" onClick={() => deleteComment(c.id)} className="hover:text-red-600 bg-transparent border-none p-0">삭제</button>
                      </>
                    )}
                  </div>
                  <div className="text-[12px] text-text leading-snug whitespace-pre-wrap break-words">{c.content}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
