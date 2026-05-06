'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { awardMlbg } from '@/lib/mlbg-award';

export type KidsItem = {
  id: number; name: string; description: string; recommended_activity: string;
  lat: number; lng: number; photo_url: string | null; address: string | null;
  dong: string | null;
  occupy_price: number; daily_income: number; like_count: number;
  author_id: string; author_name: string | null;
  occupier_id: string | null; occupier_name: string | null;
  listing_price: number | null;
  created_at: string;
};

type Comment = { id: number; author_id: string; content: string; created_at: string; author_name?: string | null };

function relTime(iso: string): string {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function KidsPanel({
  kids, onClose, onChanged,
}: { kids: KidsItem; onClose: () => void; onChanged: () => void }) {
  const supabase = createClient();
  const [me, setMe] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(kids.like_count);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLikeCount(kids.like_count); }, [kids.id, kids.like_count]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('display_name, mlbg_balance').eq('id', user.id).maybeSingle();
        const p = prof as { display_name?: string | null; mlbg_balance?: number | null } | null;
        setMe({ id: user.id, name: p?.display_name ?? '회원', balance: Number(p?.mlbg_balance ?? 0) });
        const { data: lk } = await supabase.from('kids_pin_likes')
          .select('user_id').eq('pin_id', kids.id).eq('user_id', user.id).maybeSingle();
        if (!cancelled) setLiked(!!lk);
      }
      const { data: cms } = await supabase
        .from('kids_pin_comments')
        .select('id, author_id, content, created_at')
        .eq('pin_id', kids.id).is('deleted_at', null)
        .order('created_at', { ascending: true });
      const rows = (cms ?? []) as Comment[];
      const ids = Array.from(new Set(rows.map((r) => r.author_id)));
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', ids);
        const m = new Map<string, string>();
        for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
          if (p.display_name) m.set(p.id, p.display_name);
        }
        rows.forEach((r) => { r.author_name = m.get(r.author_id) ?? '회원'; });
      }
      if (!cancelled) setComments(rows);
    })();
    return () => { cancelled = true; };
  }, [kids.id, supabase]);

  const isMine = !!me && me.id === kids.occupier_id;
  const isAuthor = !!me && me.id === kids.author_id;

  async function toggleLike() {
    if (!me) { alert('로그인 필요'); return; }
    if (isAuthor) { alert('본인 등록 핀엔 못 누름'); return; }
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('toggle_kids_pin_like', { p_pin_id: kids.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_liked: boolean; out_count: number; out_message: string | null } | undefined;
    if (row?.out_message) { alert(row.out_message); return; }
    if (row) { setLiked(row.out_liked); setLikeCount(row.out_count); }
  }

  async function occupy() {
    if (!me) { alert('로그인 필요'); return; }
    if (!confirm(`${kids.occupy_price} mlbg 로 분양받습니다.`)) return;
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('occupy_kids_pin', { p_pin_id: kids.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null; out_paid: number } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '분양 실패'); return; }
    alert(`${kids.name} 분양 완료. -${row.out_paid} mlbg`);
    onChanged();
  }

  async function release() {
    if (!confirm(`보유 해제 시 ${kids.occupy_price} mlbg 환불됨.`)) return;
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('release_kids_pin', { p_pin_id: kids.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null; out_refund: number } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '해제 실패'); return; }
    alert(`해제 완료. +${row.out_refund} mlbg 환불`);
    onChanged();
  }

  async function buy() {
    if (!me) { alert('로그인 필요'); return; }
    if (kids.listing_price == null) return;
    if (!confirm(`${kids.listing_price} mlbg 로 매수합니다.`)) return;
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('buy_kids_pin', { p_pin_id: kids.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_message: string | null; out_price: number } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '매수 실패'); return; }
    alert(`매수 완료. -${row.out_price} mlbg`);
    onChanged();
  }

  async function claim() {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('claim_kids_pin_income', { p_pin_id: kids.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_earned: number; out_message: string | null } | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '청구 실패'); return; }
    alert(`+${row.out_earned} mlbg 수익 청구 완료.`);
    onChanged();
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!me) { alert('로그인 필요'); return; }
    const c = commentText.trim();
    if (!c) return;
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('kids_pin_comments')
      .insert({ pin_id: kids.id, author_id: me.id, content: c })
      .select('id, author_id, content, created_at').single();
    setBusy(false);
    if (error || !data) { alert(error?.message ?? '저장 실패'); return; }
    const row = data as Comment;
    row.author_name = me.name;
    setComments((prev) => [...(prev ?? []), row]);
    setCommentText('');
    await awardMlbg('kids_comment', row.id, c);
  }

  return (
    <div className="absolute top-4 right-4 z-[60] bg-white border-2 border-navy shadow-2xl w-[400px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-y-auto">
      <div className="bg-[#fbcfe8] text-[#1a1d22] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[18px]">👶</span>
          <div className="min-w-0">
            <div className="font-bold text-[15px] truncate">{kids.dong ? `${kids.dong} ${kids.name}` : kids.name}</div>
            {kids.address && <div className="text-[10px] text-[#831843] truncate">{kids.address}</div>}
          </div>
        </div>
        <button onClick={onClose} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/40 hover:bg-white text-[#1a1d22] text-[18px] font-bold border-none cursor-pointer rounded-full">✕</button>
      </div>

      <div className="p-4">
        {kids.photo_url && (
          <div className="aspect-square w-full bg-[#f0f0f0] rounded-xl overflow-hidden border border-border mb-3">
            <img src={kids.photo_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="text-[12px] text-text leading-relaxed mb-2 whitespace-pre-wrap">{kids.description}</div>
        <div className="border-l-4 border-[#ec4899] bg-[#fdf2f8] px-3 py-2 mb-3">
          <div className="text-[10px] font-bold tracking-widest uppercase text-[#ec4899] mb-0.5">추천 액티비티</div>
          <div className="text-[12px] text-text leading-snug whitespace-pre-wrap">{kids.recommended_activity}</div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted mb-3">
          <span className="flex items-center gap-2">
            <span>등록 by <b className="text-navy">{kids.author_name ?? '익명'}</b></span>
            {isAuthor && (<a href={`/kids/${kids.id}/edit`} className="text-cyan underline hover:text-navy no-underline">✏ 수정</a>)}
          </span>
          <button onClick={toggleLike} disabled={isAuthor || busy}
            className={`flex items-center gap-1 px-2 py-1 border ${liked ? 'border-[#dc2626] bg-[#fef2f2] text-[#dc2626]' : 'border-border bg-white text-muted hover:border-[#dc2626] hover:text-[#dc2626]'} ${isAuthor ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <span>❤</span> <span className="tabular-nums">{likeCount}</span>
          </button>
        </div>

        <div className="border border-border bg-bg/30 px-3 py-2 mb-3 text-[12px]">
          {kids.occupier_id ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">분양: <b className="text-navy">{kids.occupier_name ?? '익명'}</b></span>
              {isMine ? (
                <div className="flex gap-1">
                  <button onClick={claim} disabled={busy} className="bg-cyan text-navy px-2 py-1 text-[11px] font-bold cursor-pointer hover:bg-cyan/80 border-none disabled:opacity-40">수익청구</button>
                  <button onClick={release} disabled={busy} className="bg-white border border-border text-text px-2 py-1 text-[11px] font-bold cursor-pointer hover:border-red-500 hover:text-red-600 disabled:opacity-40">해제</button>
                </div>
              ) : kids.listing_price != null ? (
                <button onClick={buy} disabled={busy} className="bg-[#dc2626] text-white px-3 py-1 text-[11px] font-bold cursor-pointer hover:bg-[#b91c1c] border-none disabled:opacity-40">
                  매수 ({Number(kids.listing_price).toLocaleString()} mlbg)
                </button>
              ) : null}
            </div>
          ) : (
            <button onClick={occupy} disabled={busy} className="w-full bg-navy text-white px-3 py-2 text-[12px] font-black border-none cursor-pointer hover:bg-navy-dark disabled:opacity-40">
              🚩 분양받기 ({Number(kids.occupy_price).toLocaleString()} mlbg) — 일 수익 {kids.daily_income} mlbg
            </button>
          )}
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <div className="text-[11px] font-bold tracking-widest uppercase text-muted mb-2">💬 댓글 {comments?.length ?? ''}</div>
          {comments === null ? (<p className="text-[11px] text-muted text-center py-3">불러오는 중...</p>)
            : comments.length === 0 ? (<p className="text-[11px] text-muted text-center py-3">첫 댓글을 남겨보세요. (+0.5 mlbg)</p>)
            : (
            <ul className="space-y-1.5 mb-3">
              {comments.map((c) => (
                <li key={c.id} className="text-[12px] py-1 border-b border-[#f0f0f0] last:border-b-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="font-bold text-navy">{c.author_name ?? '회원'}</span>
                    <span className="text-muted text-[10px]">{relTime(c.created_at)} 전</span>
                  </div>
                  <p className="text-text leading-snug whitespace-pre-wrap break-words">{c.content}</p>
                </li>
              ))}
            </ul>
          )}
          {me ? (
            <form onSubmit={submitComment} className="flex gap-2">
              <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
                placeholder="댓글... (Enter = 줄바꿈)" maxLength={500} rows={1}
                className="flex-1 min-w-0 border border-border px-2 py-1 text-[12px] outline-none focus:border-navy resize-y leading-relaxed" />
              <button type="submit" disabled={busy || !commentText.trim()}
                className="flex-shrink-0 bg-navy text-white px-3 py-1 text-[11px] font-bold cursor-pointer hover:bg-navy-dark disabled:opacity-40 border-none whitespace-nowrap">
                등록
              </button>
            </form>
          ) : (<p className="text-[11px] text-muted text-center"><a href="/login" className="text-navy font-bold underline">로그인</a> 후 작성</p>)}
        </div>
      </div>
    </div>
  );
}
