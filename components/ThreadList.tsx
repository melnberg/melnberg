'use client';

// 스레드 리스트 — Meta Threads 스타일.
// 카드: 아바타 / 닉네임 / 시각 / 본문(linkify) / 좋아요·답글
// 좋아요는 supabase RPC `toggle_thread_like` (optimistic UI)
// 답글 N 클릭 → /t/{id} 로 이동

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Nickname from './Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import { linkify } from '@/lib/linkify';

export type Thread = {
  id: number;
  author_id: string;
  parent_id: number | null;
  content: string;
  like_count: number;
  reply_count: number;
  created_at: string;
  author: {
    display_name: string | null;
    avatar_url: string | null;
    tier: string | null;
    tier_expires_at?: string | null;
    is_solo?: boolean | null;
    link_url?: string | null;
  } | null;
  liked: boolean;
};

type Props = {
  threads: Thread[];
  currentUserId: string | null;
  /** 메인/단독 페이지면 true (카드마다 작성자), /u/{id} 페이지면 false (한 사람) */
  showAuthor?: boolean;
  /** 빈 상태 메시지 */
  emptyText?: string;
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일`;
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });
}

function ThreadCard({
  t,
  currentUserId,
  showAuthor,
  onToggleLike,
  editingId,
  editContent,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onSaveEdit,
  onDelete,
  saving,
}: {
  t: Thread;
  currentUserId: string | null;
  showAuthor: boolean;
  onToggleLike: (id: number) => void;
  editingId: number | null;
  editContent: string;
  onStartEdit: (id: number, content: string) => void;
  onCancelEdit: () => void;
  onChangeEdit: (val: string) => void;
  onSaveEdit: (id: number) => void;
  onDelete: (id: number) => void;
  saving: boolean;
}) {
  const router = useRouter();
  const author = t.author;
  const isOwner = currentUserId !== null && currentUserId === t.author_id;
  const isEditing = editingId === t.id;

  // 카드 클릭 시 단독 페이지 — 단, 링크/이미지/버튼/textarea/수정 모드일 땐 제외
  function handleCardClick(e: React.MouseEvent) {
    if (isEditing) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, img, textarea')) return;
    router.push(`/t/${t.id}`);
  }

  const avatar = author?.avatar_url ? (
    <img src={author.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-[#e8d9b8] flex-shrink-0" />
  ) : (
    <div className="w-10 h-10 rounded-full bg-[#f5e8cc] border-2 border-[#e8d9b8] flex items-center justify-center text-[#5c4634] text-[14px] font-bold flex-shrink-0">
      {(author?.display_name?.[0] ?? '?').toUpperCase()}
    </div>
  );

  return (
    <article
      onClick={handleCardClick}
      className={`flex gap-3 p-4 border-b border-[#e8d9b8] last:border-b-0 ${isEditing ? '' : 'hover:bg-[#fdf6e3]/60 cursor-pointer'}`}
    >
      <div className="flex-shrink-0">{avatar}</div>
      <div className="flex-1 min-w-0">
        {showAuthor && (
          <div className="flex items-center gap-2 mb-1 text-[13px]">
            <Nickname info={profileToNicknameInfo(author, t.author_id)} />
            <span className="text-[#a07f5f] text-[11px]">· {formatRelative(t.created_at)}</span>
          </div>
        )}
        {!showAuthor && (
          <div className="text-[11px] text-[#a07f5f] mb-1">{formatRelative(t.created_at)}</div>
        )}
        {isEditing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <textarea
              value={editContent}
              onChange={(e) => onChangeEdit(e.target.value)}
              className="w-full min-h-[80px] p-2 border-2 border-[#e8d9b8] rounded-xl text-[14px] text-[#5c4634] bg-[#fff8ec] resize-y focus:outline-none focus:border-[#c89b6f] leading-loose"
              autoFocus
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSaveEdit(t.id); }}
                disabled={saving || editContent.trim() === ''}
                className="bg-[#5c4634] text-[#fff8ec] px-4 py-1.5 text-[12px] font-bold disabled:opacity-50 hover:bg-[#3d2f22] rounded-full"
              >
                {saving ? '저장중…' : '저장'}
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCancelEdit(); }}
                disabled={saving}
                className="px-3 py-1 text-[12px] text-[#a07f5f] hover:text-[#5c4634] disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[14px] text-[#5c4634] whitespace-pre-wrap break-words leading-loose">
            {linkify(t.content)}
          </div>
        )}
        <div className="flex items-center gap-5 mt-3 text-[12px] text-[#a07f5f]">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleLike(t.id); }}
            disabled={!currentUserId || isEditing}
            className={`flex items-center gap-1 ${currentUserId && !isEditing ? 'hover:text-[#5c4634]' : 'cursor-not-allowed opacity-50'}`}
            title={currentUserId ? '좋아요' : '로그인 필요'}
          >
            <span className={t.liked ? 'text-[#c89b6f]' : ''} aria-hidden>{t.liked ? '♥' : '♡'}</span>
            <span className="tabular-nums">{t.like_count}</span>
          </button>
          <Link
            href={`/t/${t.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 hover:text-[#5c4634] no-underline text-[#a07f5f]"
          >
            <span aria-hidden>💬</span>
            <span className="tabular-nums">{t.reply_count}</span>
          </Link>
          {isOwner && !isEditing && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onStartEdit(t.id, t.content); }}
                className="hover:text-[#5c4634]"
                title="수정"
                aria-label="수정"
              >
                <span aria-hidden>✏</span>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                className="hover:text-[#5c4634]"
                title="삭제"
                aria-label="삭제"
              >
                <span aria-hidden>🗑</span>
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ThreadList({ threads, currentUserId, showAuthor = true, emptyText = '아직 글이 없어요.' }: Props) {
  const [items, setItems] = useState<Thread[]>(threads);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const supabase = createClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(id: number, content: string) {
    setEditingId(id);
    setEditContent(content);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditContent('');
  }

  async function saveEdit(id: number) {
    const content = editContent.trim();
    if (content === '' || saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('update_thread', { p_id: id, p_content: content });
    setSaving(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || (row && row.out_success === false)) {
      alert('수정 실패: ' + (error?.message ?? row?.out_message ?? '알 수 없음'));
      return;
    }
    setItems((cur) => cur.map((t) => (t.id === id ? { ...t, content } : t)));
    setEditingId(null);
    setEditContent('');
    router.refresh();
  }

  async function deleteThread(id: number) {
    if (!confirm('삭제할까?')) return;
    const { data, error } = await supabase.rpc('delete_thread', { p_id: id });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || (row && row.out_success === false)) {
      alert('삭제 실패: ' + (error?.message ?? row?.out_message ?? '알 수 없음'));
      return;
    }
    setItems((cur) => cur.filter((t) => t.id !== id));
    router.refresh();
  }

  async function toggleLike(threadId: number) {
    if (!currentUserId) return;
    // optimistic
    const prev = items;
    setItems((cur) =>
      cur.map((t) =>
        t.id === threadId
          ? { ...t, liked: !t.liked, like_count: Math.max(0, t.like_count + (t.liked ? -1 : 1)) }
          : t,
      ),
    );
    const { data, error } = await supabase.rpc('toggle_thread_like', { p_thread_id: threadId });
    if (error) {
      // rollback
      startTransition(() => setItems(prev));
      return;
    }
    // RPC 결과로 정합 보정
    const row = Array.isArray(data) ? data[0] : data;
    const liked = (row as { out_liked?: boolean } | null)?.out_liked ?? false;
    const cnt = (row as { out_count?: number } | null)?.out_count ?? 0;
    setItems((cur) =>
      cur.map((t) => (t.id === threadId ? { ...t, liked, like_count: cnt } : t)),
    );
  }

  if (items.length === 0) {
    return <p className="text-center py-12 text-[#8a6f55] text-[13px] leading-loose">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col bg-transparent">
      {items.map((t) => (
        <ThreadCard
          key={t.id}
          t={t}
          currentUserId={currentUserId}
          showAuthor={showAuthor}
          onToggleLike={toggleLike}
          editingId={editingId}
          editContent={editContent}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onChangeEdit={setEditContent}
          onSaveEdit={saveEdit}
          onDelete={deleteThread}
          saving={saving}
        />
      ))}
    </div>
  );
}
