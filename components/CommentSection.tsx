'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type CommunityComment } from '@/lib/community';

type Props = {
  postId: number;
  comments: CommunityComment[];
  currentUserId: string | null;
};

function formatRelativeKo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function CommentSection({ postId, comments, currentUserId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [list, setList] = useState(comments);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !content.trim()) return;
    setErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, author_id: currentUserId!, content: content.trim() })
      .select('id, post_id, author_id, content, created_at, author:profiles!author_id(display_name)')
      .single();

    setLoading(false);
    if (error || !data) {
      setErr(error?.message ?? '저장 실패');
      return;
    }
    setList([...list, data as unknown as CommunityComment]);
    setContent('');
    router.refresh();
  }

  async function handleDelete(commentId: number) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) {
      alert(error.message);
      return;
    }
    setList(list.filter((c) => c.id !== commentId));
    router.refresh();
  }

  return (
    <div>
      <h2 className="text-base font-bold text-navy mb-4 pb-3 border-b-2 border-navy">
        댓글 <span className="text-muted font-semibold">{list.length}</span>
      </h2>

      {list.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">첫 댓글을 남겨주세요.</p>
      ) : (
        <ul className="mb-6">
          {list.map((c) => (
            <li key={c.id} className="py-4 border-b border-border last:border-b-0">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-bold text-navy">{c.author?.display_name ?? '익명'}</span>
                  <span className="text-muted">·</span>
                  <span className="text-muted">{formatRelativeKo(c.created_at)}</span>
                </div>
                {currentUserId === c.author_id && (
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="text-[11px] text-muted hover:text-red-600 cursor-pointer"
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="text-sm leading-relaxed break-keep whitespace-pre-wrap">{c.content}</p>
            </li>
          ))}
        </ul>
      )}

      {currentUserId ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-6 pt-6 border-t border-border">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 입력하세요"
            rows={3}
            className="border border-border border-b-2 border-b-navy px-3.5 py-2.5 text-[14px] outline-none focus:border-b-cyan rounded-none resize-y leading-relaxed"
          />
          {err && <div className="text-xs text-red-700">{err}</div>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !content.trim()}
              className="bg-navy text-white border-none px-5 py-2.5 text-[12px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '게시 중...' : '댓글 게시'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted text-center mt-6 pt-6 border-t border-border">
          댓글을 작성하려면{' '}
          <a href={`/login?next=/community/${postId}`} className="text-navy font-semibold underline">로그인</a>이 필요합니다.
        </p>
      )}
    </div>
  );
}
