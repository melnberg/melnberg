'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { awardMlbg } from '@/lib/mlbg-award';

export type StoreItem = {
  id: number; author_id: string; name: string; category: string | null;
  description: string; recommended: string | null;
  lat: number; lng: number; photo_url: string | null;
  address: string | null; dong: string | null;
  contact: string | null; url: string | null;
  verified: boolean; like_count: number;
  author_name?: string | null;
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

export default function MyStoreDetailClient({ store }: { store: StoreItem }) {
  const supabase = createClient();
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(store.like_count);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
        setMe({ id: user.id, name: (prof as { display_name?: string | null } | null)?.display_name ?? '회원' });
        const { data: lk } = await supabase.from('my_store_likes')
          .select('user_id').eq('store_id', store.id).eq('user_id', user.id).maybeSingle();
        if (!cancelled) setLiked(!!lk);
      }
      const { data: cms } = await supabase
        .from('my_store_comments')
        .select('id, author_id, content, created_at')
        .eq('store_id', store.id).is('deleted_at', null)
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
  }, [store.id, supabase]);

  const isAuthor = !!me && me.id === store.author_id;
  const fullName = store.dong ? `${store.dong} ${store.name}` : store.name;

  async function toggleLike() {
    if (!me) { alert('로그인 필요'); return; }
    if (isAuthor) { alert('본인 가게엔 못 누름'); return; }
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('toggle_my_store_like', { p_store_id: store.id });
    setBusy(false);
    if (error) { alert(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as { out_liked: boolean; out_count: number; out_message: string | null } | undefined;
    if (row?.out_message) { alert(row.out_message); return; }
    if (row) { setLiked(row.out_liked); setLikeCount(row.out_count); }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!me) { alert('로그인 필요'); return; }
    const c = commentText.trim();
    if (!c) return;
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.from('my_store_comments')
      .insert({ store_id: store.id, author_id: me.id, content: c })
      .select('id, author_id, content, created_at').single();
    setBusy(false);
    if (error || !data) { alert(error?.message ?? '저장 실패'); return; }
    const row = data as Comment;
    row.author_name = me.name;
    setComments((prev) => [...(prev ?? []), row]);
    setCommentText('');
    await awardMlbg('store_comment', row.id, c);
  }

  return (
    <article>
      <header className="pb-4 mb-6 border-b border-border">
        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
          <span className="text-[20px]">🏪</span>
          <h1 className="text-[24px] font-bold text-navy tracking-tight">{fullName}</h1>
          {store.verified && (
            <span className="text-[10px] font-bold tracking-wider uppercase bg-cyan text-white px-2 py-0.5">✓ 사업자 인증</span>
          )}
          {store.category && <span className="text-[11px] text-muted">{store.category}</span>}
          <span className="text-[10px] text-muted">·</span>
          <button onClick={toggleLike} disabled={isAuthor || busy}
            className={`flex items-center gap-1 px-2 py-1 border text-[11px] ${liked ? 'border-[#dc2626] bg-[#fef2f2] text-[#dc2626]' : 'border-border bg-white text-muted hover:border-[#dc2626] hover:text-[#dc2626]'} ${isAuthor ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <span>❤</span> <span className="tabular-nums">{likeCount}</span>
          </button>
        </div>
        {store.address && <div className="text-[12px] text-muted">{store.address}</div>}
        <div className="text-[11px] text-muted mt-1 flex items-center gap-2 flex-wrap">
          <span>운영자 <b className="text-navy">{store.author_name ?? '익명'}</b></span>
          <span className="tabular-nums">+30 mlbg</span>
          {isAuthor && (
            <Link href={`/stores/${store.id}/edit`} className="text-cyan underline hover:text-navy no-underline">✏ 수정</Link>
          )}
        </div>
      </header>

      {store.photo_url && (
        <div className="aspect-square w-full max-w-[600px] mx-auto bg-[#f0f0f0] rounded-xl overflow-hidden border border-border mb-6">
          <img src={store.photo_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="text-[14px] text-text leading-relaxed mb-4 whitespace-pre-wrap">{store.description}</div>

      {store.recommended && (
        <div className="border-l-4 border-cyan bg-cyan/5 px-4 py-3 mb-6">
          <div className="text-[11px] font-bold tracking-widest uppercase text-cyan mb-1">대표 메뉴/서비스</div>
          <div className="text-[14px] text-text leading-relaxed whitespace-pre-wrap">{store.recommended}</div>
        </div>
      )}

      {(store.contact || store.url) && (
        <div className="border border-border bg-bg/30 px-4 py-3 mb-8 text-[13px] flex flex-col gap-1">
          {store.contact && <div>📞 {store.contact}</div>}
          {store.url && <div>🔗 <a href={store.url} target="_blank" rel="noreferrer noopener" className="text-cyan underline hover:text-navy no-underline break-all">{store.url}</a></div>}
        </div>
      )}

      {/* 댓글 */}
      <div className="border-t border-border pt-6">
        <h2 className="text-[14px] font-bold text-navy mb-3">💬 댓글 {comments?.length ?? 0}</h2>
        {comments === null ? (
          <p className="text-[12px] text-muted text-center py-6">불러오는 중...</p>
        ) : comments.length === 0 ? (
          <p className="text-[12px] text-muted text-center py-6">첫 댓글을 남겨보세요. (+0.5 mlbg)</p>
        ) : (
          <ul className="space-y-3 mb-6">
            {comments.map((c) => (
              <li key={c.id} className="text-[13px] py-2 border-b border-[#f0f0f0] last:border-b-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-bold text-navy">{c.author_name ?? '회원'}</span>
                  <span className="text-muted text-[10px]">{relTime(c.created_at)} 전</span>
                  <span className="text-muted text-[10px] tabular-nums">+0.5 mlbg</span>
                </div>
                <p className="text-text leading-relaxed whitespace-pre-wrap break-words">{c.content}</p>
              </li>
            ))}
          </ul>
        )}
        {me ? (
          <form onSubmit={submitComment} className="flex gap-2">
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
              placeholder="댓글... (Enter = 줄바꿈)" maxLength={500} rows={2}
              className="flex-1 min-w-0 border border-border px-3 py-2 text-[13px] outline-none focus:border-navy resize-y leading-relaxed" />
            <button type="submit" disabled={busy || !commentText.trim()}
              className="flex-shrink-0 bg-navy text-white px-4 py-2 text-[12px] font-bold cursor-pointer hover:bg-navy-dark disabled:opacity-40 border-none whitespace-nowrap">
              등록
            </button>
          </form>
        ) : (
          <p className="text-[12px] text-muted text-center"><a href="/login" className="text-navy font-bold underline">로그인</a> 후 작성</p>
        )}
      </div>
    </article>
  );
}
