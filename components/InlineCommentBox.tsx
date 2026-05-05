'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { awardMlbg, type MlbgAwardKind } from '@/lib/mlbg-award';
import { revalidateHome } from '@/lib/revalidate-home';

// 피드 카드 안에서 댓글 미리보기 + 작성. kind 별로 테이블/컬럼 분기.
export type InlineKind = 'discussion' | 'post' | 'emart_occupy' | 'factory_occupy';

const TABLE: Record<InlineKind, { table: string; parentCol: string; awardKind: MlbgAwardKind }> = {
  discussion:     { table: 'apt_discussion_comments', parentCol: 'discussion_id', awardKind: 'apt_comment' },
  post:           { table: 'comments',                parentCol: 'post_id',       awardKind: 'community_comment' },
  emart_occupy:   { table: 'emart_comments',          parentCol: 'emart_id',      awardKind: 'emart_comment' },
  factory_occupy: { table: 'factory_comments',        parentCol: 'factory_id',    awardKind: 'factory_comment' },
};

type CommentRow = {
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
  if (sec < 604800) return `${Math.floor(sec / 86400)}일`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function InlineCommentBox({
  kind, parentId, currentUserId, currentUserName, onCountChange,
}: {
  kind: InlineKind;
  parentId: number;
  currentUserId: string | null;
  currentUserName: string | null;
  onCountChange?: (n: number) => void;
}) {
  const cfg = TABLE[kind];
  const supabase = createClient();
  const [list, setList] = useState<CommentRow[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // 첫 마운트 — 댓글 + 작성자명 fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from(cfg.table)
        .select(`id, author_id, content, created_at`)
        .eq(cfg.parentCol, parentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      const rows = (data ?? []) as CommentRow[];
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
      if (!cancelled) {
        setList(rows);
        onCountChange?.(rows.length);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, parentId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !currentUserId || !text.trim()) return;
    setBusy(true);
    const insertObj: Record<string, unknown> = { author_id: currentUserId, content: text.trim() };
    insertObj[cfg.parentCol] = parentId;
    const { data, error } = await supabase.from(cfg.table).insert(insertObj).select('id, author_id, content, created_at').single();
    setBusy(false);
    if (error || !data) { alert(error?.message ?? '저장 실패'); return; }
    const row = data as CommentRow;
    row.author_name = currentUserName ?? '회원';
    setList((prev) => {
      const next = [...(prev ?? []), row];
      onCountChange?.(next.length);
      return next;
    });
    setText('');
    await awardMlbg(cfg.awardKind, row.id, row.content);
    revalidateHome();
  }

  return (
    <div className="px-4 py-3 bg-[#fafbfc] border-t border-[#f0f0f0]">
      {list === null ? (
        <p className="text-[11px] text-muted text-center py-3">불러오는 중...</p>
      ) : list.length === 0 ? (
        <p className="text-[11px] text-muted text-center py-3">첫 댓글을 남겨보세요.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {list.map((c) => (
            <li key={c.id} className="text-[12px]">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-bold text-navy">{c.author_name ?? '회원'}</span>
                <span className="text-muted text-[10px]">{relTime(c.created_at)}</span>
              </div>
              <p className="text-text leading-snug whitespace-pre-wrap break-words">{c.content}</p>
            </li>
          ))}
        </ul>
      )}

      {currentUserId ? (
        <form onSubmit={submit} className="flex gap-2 items-stretch">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="댓글 작성..."
            maxLength={500}
            className="flex-1 min-w-0 border border-border px-3 py-2 text-[13px] outline-none focus:border-navy"
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
        <p className="text-[11px] text-muted text-center">
          <a href="/login?next=/" className="text-navy font-bold underline">로그인</a> 후 댓글 작성
        </p>
      )}
    </div>
  );
}
