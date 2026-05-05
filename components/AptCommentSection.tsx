'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { awardMlbg } from '@/lib/mlbg-award';
import { linkify } from '@/lib/linkify';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import Nickname from './Nickname';
import RewardTooltip from './RewardTooltip';

export type AptComment = {
  id: number;
  discussion_id: number;
  author_id: string;
  content: string;
  created_at: string;
  author?: {
    display_name: string | null;
    link_url: string | null;
    tier: string | null;
    tier_expires_at: string | null;
    is_solo: boolean | null;
    avatar_url: string | null;
    apt_count: number | null;
  } | null;
};

type Props = {
  discussionId: number;
  comments: AptComment[];
  currentUserId: string | null;
  currentUserName?: string | null;
  earnedMap?: Record<number, number>;
};

function relTime(iso: string): string {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function AptCommentSection({ discussionId, comments, currentUserId, currentUserName, earnedMap = {} }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [list, setList] = useState(comments);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !content.trim() || !currentUserId) return;
    setErr(null); setLoading(true);
    const { data, error } = await supabase
      .from('apt_discussion_comments')
      .insert({ discussion_id: discussionId, author_id: currentUserId, content: content.trim() })
      .select('id, discussion_id, author_id, content, created_at, author:profiles!author_id(display_name, link_url, tier, tier_expires_at, is_solo, avatar_url, apt_count)')
      .single();
    setLoading(false);
    if (error || !data) { setErr(error?.message ?? '저장 실패'); return; }
    setList([...list, data as unknown as AptComment]);
    setContent('');
    await awardMlbg('apt_comment', (data as { id: number }).id, content.trim());
    router.refresh();
  }

  async function remove(commentId: number) {
    if (!confirm('댓글을 삭제할까요?')) return;
    const { error } = await supabase
      .from('apt_discussion_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId);
    if (error) { alert(error.message); return; }
    setList(list.filter((c) => c.id !== commentId));
    router.refresh();
  }

  return (
    <div>
      <h2 className="text-[14px] font-bold text-navy mb-2 pb-2 border-b-2 border-navy">
        댓글 <span className="text-muted font-semibold">{list.length}</span>
      </h2>

      {list.length === 0 ? (
        <p className="text-muted text-sm py-4 text-center">첫 댓글을 남겨주세요.</p>
      ) : (
        <ul className="mb-3">
          {list.map((c) => {
            const earned = earnedMap[c.id];
            const isMine = currentUserId === c.author_id;
            return (
              <li key={c.id} className="border-b border-border last:border-b-0 py-2.5">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="font-bold text-navy">
                      <Nickname info={profileToNicknameInfo(c.author ?? null, c.author_id)} />
                    </span>
                    <span className="text-muted">·</span>
                    <span className="text-muted">{relTime(c.created_at)}</span>
                    {typeof earned === 'number' && earned > 0 && (
                      <>
                        <span className="text-muted">·</span>
                        <RewardTooltip earned={earned} kind="apt_comment" />
                      </>
                    )}
                  </div>
                  {isMine && (
                    <button type="button" onClick={() => remove(c.id)} className="text-[11px] text-muted hover:text-red-600 cursor-pointer bg-transparent border-none p-0">
                      삭제
                    </button>
                  )}
                </div>
                <p className="text-[13px] leading-relaxed break-keep whitespace-pre-wrap">{linkify(c.content)}</p>
              </li>
            );
          })}
        </ul>
      )}

      {currentUserId ? (
        <form onSubmit={submit} className="mt-3 border border-border focus-within:border-navy transition-colors">
          <div className="px-4 pt-3 text-[13px] font-bold text-text">{currentUserName ?? '회원'}</div>
          <textarea
            value={content} onChange={(e) => setContent(e.target.value)}
            placeholder="댓글을 남겨보세요" rows={2}
            className="block w-full px-4 pt-1 pb-2 text-[14px] outline-none rounded-none resize-none leading-relaxed border-none focus:ring-0 placeholder:text-muted"
          />
          <div className="flex items-center justify-between px-4 py-2 border-t border-border">
            {err ? (
              <span className="text-xs text-red-700">{err}</span>
            ) : (
              <span className="text-xs text-muted">{content.length}자</span>
            )}
            <button type="submit" disabled={loading || !content.trim()} className="bg-navy text-white px-4 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed border-none">
              {loading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted text-center mt-3 pt-3 border-t border-border">
          댓글을 작성하려면 <a href={`/login?next=/d/${discussionId}`} className="text-navy font-semibold underline">로그인</a>이 필요합니다.
        </p>
      )}
    </div>
  );
}
