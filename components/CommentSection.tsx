'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type CommunityComment } from '@/lib/community';
import { awardMlbg, awardToastMessage } from '@/lib/mlbg-award';
import Nickname from './Nickname';

type Props = {
  postId: number;
  comments: CommunityComment[];
  currentUserId: string | null;
  currentUserName?: string | null;
};

type CommentNode = CommunityComment & { replies: CommunityComment[] };

function buildTree(comments: CommunityComment[]): CommentNode[] {
  const map = new Map<number, CommentNode>();
  const top: CommentNode[] = [];
  comments.forEach((c) => map.set(c.id, { ...c, replies: [] }));
  comments.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parent_id) {
      const parent = map.get(c.parent_id);
      if (parent) parent.replies.push(node);
      else top.push(node); // 부모가 삭제된 고아 댓글
    } else {
      top.push(node);
    }
  });
  return top;
}

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

export default function CommentSection({ postId, comments, currentUserId, currentUserName }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [list, setList] = useState(comments);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  const tree = useMemo(() => buildTree(list), [list]);
  const totalCount = list.length;

  async function handleSubmitTop(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !content.trim() || !currentUserId) return;
    setErr(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, author_id: currentUserId, content: content.trim(), parent_id: null })
      .select('id, post_id, author_id, parent_id, content, created_at, author:profiles!author_id(display_name, link_url, tier, tier_expires_at)')
      .single();
    setLoading(false);
    if (error || !data) {
      setErr(error?.message ?? '저장 실패');
      return;
    }
    setList([...list, data as unknown as CommunityComment]);
    setContent('');
    const insertedId = (data as { id: number }).id;
    awardMlbg('community_comment', insertedId, content.trim()).then((r) => {
      const msg = awardToastMessage(r);
      if (msg && r.ok && r.multiplier <= 0.3) alert(msg);
    });
    router.refresh();
  }

  async function handleSubmitReply(parentId: number, replyContent: string) {
    if (!currentUserId) return;
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, author_id: currentUserId, content: replyContent.trim(), parent_id: parentId })
      .select('id, post_id, author_id, parent_id, content, created_at, author:profiles!author_id(display_name, link_url, tier, tier_expires_at)')
      .single();
    if (error || !data) {
      alert(error?.message ?? '저장 실패');
      return;
    }
    setList([...list, data as unknown as CommunityComment]);
    setReplyingTo(null);
    const insertedId = (data as { id: number }).id;
    awardMlbg('community_comment', insertedId, replyContent.trim()).then((r) => {
      const msg = awardToastMessage(r);
      if (msg && r.ok && r.multiplier <= 0.3) alert(msg);
    });
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
      <h2 className="text-[14px] font-bold text-navy mb-2 pb-2 border-b-2 border-navy">
        댓글 <span className="text-muted font-semibold">{totalCount}</span>
      </h2>

      {tree.length === 0 ? (
        <p className="text-muted text-sm py-4 text-center">첫 댓글을 남겨주세요.</p>
      ) : (
        <ul className="mb-3">
          {tree.map((c) => (
            <li key={c.id} className="border-b border-border last:border-b-0">
              <CommentRow
                comment={c}
                currentUserId={currentUserId}
                onReply={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                onDelete={() => handleDelete(c.id)}
                showReplyButton={Boolean(currentUserId)}
              />

              {/* 답글 목록 */}
              {c.replies.length > 0 && (
                <ul className="pl-6 border-l-2 border-border ml-2 my-1">
                  {c.replies.map((r) => (
                    <li key={r.id} className="border-b border-border last:border-b-0 py-2.5">
                      <CommentRow
                        comment={r}
                        currentUserId={currentUserId}
                        onDelete={() => handleDelete(r.id)}
                        showReplyButton={false}
                        compact
                      />
                    </li>
                  ))}
                </ul>
              )}

              {/* 답글 입력 폼 */}
              {replyingTo === c.id && currentUserId && (
                <div className="pl-6 ml-2 my-2 border-l-2 border-cyan">
                  <ReplyForm
                    currentUserName={currentUserName ?? '회원'}
                    onCancel={() => setReplyingTo(null)}
                    onSubmit={(text) => handleSubmitReply(c.id, text)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {currentUserId ? (
        <form
          onSubmit={handleSubmitTop}
          className="mt-3 border border-border focus-within:border-navy transition-colors"
        >
          <div className="px-4 pt-3 text-[13px] font-bold text-text">{currentUserName}</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 남겨보세요"
            rows={2}
            className="block w-full px-4 pt-1 pb-2 text-[14px] outline-none rounded-none resize-none leading-relaxed border-none focus:ring-0 placeholder:text-muted"
          />
          <div className="flex items-center justify-between px-4 py-2 border-t border-border">
            {err ? (
              <span className="text-xs text-red-700">{err}</span>
            ) : (
              <span className="text-xs text-muted">{content.length}자</span>
            )}
            <button
              type="submit"
              disabled={loading || !content.trim()}
              className="bg-navy text-white px-4 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed border-none"
            >
              {loading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted text-center mt-3 pt-3 border-t border-border">
          댓글을 작성하려면{' '}
          <a href={`/login?next=/community/${postId}`} className="text-navy font-semibold underline">로그인</a>이 필요합니다.
        </p>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  currentUserId,
  onReply,
  onDelete,
  showReplyButton,
  compact,
}: {
  comment: CommunityComment;
  currentUserId: string | null;
  onReply?: () => void;
  onDelete: () => void;
  showReplyButton: boolean;
  compact?: boolean;
}) {
  const isMine = currentUserId === comment.author_id;
  return (
    <div className={compact ? '' : 'py-2.5'}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-bold text-navy">
            <Nickname info={{
              name: comment.author?.display_name ?? null,
              link: comment.author?.link_url ?? null,
              isPaid: comment.author?.tier === 'paid' && (!comment.author?.tier_expires_at || new Date(comment.author.tier_expires_at).getTime() > Date.now()),
              isSolo: !!comment.author?.is_solo,
              userId: comment.author_id,
              avatarUrl: comment.author?.avatar_url ?? null,
            }} />
          </span>
          <span className="text-muted">·</span>
          <span className="text-muted">{formatRelativeKo(comment.created_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          {showReplyButton && onReply && (
            <button
              type="button"
              onClick={onReply}
              className="text-[11px] text-muted hover:text-navy cursor-pointer bg-transparent border-none p-0"
            >
              답글
            </button>
          )}
          {isMine && (
            <button
              type="button"
              onClick={onDelete}
              className="text-[11px] text-muted hover:text-red-600 cursor-pointer bg-transparent border-none p-0"
            >
              삭제
            </button>
          )}
        </div>
      </div>
      <p className="text-[13px] leading-relaxed break-keep whitespace-pre-wrap">{comment.content}</p>
    </div>
  );
}

function ReplyForm({
  currentUserName,
  onCancel,
  onSubmit,
}: {
  currentUserName: string;
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !text.trim()) return;
    setLoading(true);
    await onSubmit(text);
    setLoading(false);
  }

  return (
    <form onSubmit={handle} className="border border-border focus-within:border-navy transition-colors">
      <div className="px-3 pt-2.5 text-[12px] font-bold text-text">{currentUserName}</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="답글을 남겨보세요"
        rows={2}
        autoFocus
        className="block w-full px-3 pt-0.5 pb-2 text-[13px] outline-none rounded-none resize-none leading-relaxed border-none focus:ring-0 placeholder:text-muted"
      />
      <div className="flex items-center justify-end gap-3 px-3 py-1.5 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-muted hover:text-text cursor-pointer bg-transparent border-none p-0"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="bg-navy text-white px-4 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed border-none"
        >
          {loading ? '등록 중...' : '등록'}
        </button>
      </div>
    </form>
  );
}
