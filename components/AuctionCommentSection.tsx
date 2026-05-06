'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { awardMlbg } from '@/lib/mlbg-award';

// 경매 댓글 — 입찰자/관전자 채팅. 댓글 1개당 +0.5 mlbg.
// 5초 폴링 — 다른 사람 댓글 즉시 반영 (입찰 폼과 같은 주기).

type Comment = {
  id: number;
  author_id: string;
  content: string;
  created_at: string;
  author_name?: string | null;
};

function relTime(iso: string): string {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function AuctionCommentSection({
  auctionId,
  currentUserId,
  currentUserName,
}: {
  auctionId: number;
  currentUserId: string | null;
  currentUserName: string | null;
}) {
  const supabase = createClient();
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function refetch() {
    const { data } = await supabase
      .from('auction_comments')
      .select('id, author_id, content, created_at')
      .eq('auction_id', auctionId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    const rows = (data ?? []) as Comment[];
    const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', authorIds);
      const m = new Map<string, string>();
      for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name) m.set(p.id, p.display_name);
      }
      rows.forEach((r) => { r.author_name = m.get(r.author_id) ?? '회원'; });
    }
    setList(rows);
  }

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !currentUserId) return;
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('auction_comments')
      .insert({ auction_id: auctionId, author_id: currentUserId, content })
      .select('id, author_id, content, created_at')
      .single();
    setBusy(false);
    if (error || !data) { alert(error?.message ?? '저장 실패'); return; }
    const row = data as Comment;
    row.author_name = currentUserName ?? '회원';
    setList((prev) => [...(prev ?? []), row]);
    setText('');
    await awardMlbg('auction_comment', row.id, content);
  }

  return (
    <section className="mt-10">
      <h2 className="text-[14px] font-bold text-navy mb-2 pb-2 border-b-2 border-navy">
        💬 경매 채팅 {list ? `(${list.length})` : ''}
      </h2>

      {list === null ? (
        <p className="text-[13px] text-muted py-6 text-center">불러오는 중...</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-muted py-6 text-center">첫 댓글을 남겨보세요. 작성 시 +0.5 mlbg.</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {list.map((c) => (
            <li key={c.id} className="text-[13px] py-1.5 border-b border-[#f0f0f0] last:border-b-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-bold text-navy">{c.author_name ?? '회원'}</span>
                <span className="text-muted text-[10px]">{relTime(c.created_at)} 전</span>
              </div>
              <p className="text-text leading-snug whitespace-pre-wrap break-words">{c.content}</p>
            </li>
          ))}
        </ul>
      )}

      {currentUserId ? (
        <form onSubmit={submit} className="flex gap-2 items-stretch">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="채팅... (Enter = 줄바꿈, 작성 시 +0.5 mlbg)"
            maxLength={500}
            rows={1}
            className="flex-1 min-w-0 border border-border px-3 py-2 text-[13px] outline-none focus:border-navy resize-y leading-relaxed"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="bg-navy text-white px-3 py-2 text-[12px] font-bold cursor-pointer hover:bg-navy-dark disabled:opacity-40 border-none whitespace-nowrap"
          >
            {busy ? '...' : '등록'}
          </button>
        </form>
      ) : (
        <p className="text-[12px] text-muted text-center py-3">
          <a href="/login" className="text-navy font-bold underline">로그인</a> 후 채팅 작성
        </p>
      )}
    </section>
  );
}
