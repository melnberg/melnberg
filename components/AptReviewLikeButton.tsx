'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { checkAndPayBridgeToll } from '@/lib/bridge-toll';

// 단지 리뷰 [찐리뷰♡] 버튼.
// 누구나 누름 (본인 글 제외). 좋아요 ON → 글 작성자 +3 mlbg / OFF → -3 mlbg 회수.
// 활동 직전 다리 통행료 (한강 횡단 시) 자동 검사·결제.
// 안내 문구로 차감 위협 노출 (실제 차감 X — 위협용).
export default function AptReviewLikeButton({
  discussionId,
  authorId,
  initialCount,
  currentUserId,
  aptLat,
  aptLng,
}: {
  discussionId: number;
  authorId: string;
  initialCount: number;
  currentUserId: string | null;
  aptLat?: number | null;
  aptLng?: number | null;
}) {
  const supabase = createClient();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const isAuthor = !!currentUserId && currentUserId === authorId;

  useEffect(() => {
    if (!currentUserId || isAuthor) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('apt_discussion_likes')
        .select('discussion_id')
        .eq('discussion_id', discussionId)
        .eq('user_id', currentUserId)
        .maybeSingle();
      if (!cancelled && data) setLiked(true);
    })();
    return () => { cancelled = true; };
  }, [discussionId, currentUserId, isAuthor, supabase]);

  async function handleClick() {
    if (busy) return;
    if (!currentUserId) { alert('로그인 후 누를 수 있어요.'); return; }
    if (isAuthor) { alert('본인 리뷰엔 못 눌러요.'); return; }
    setBusy(true);
    // 다리 통행료 사전 검사 (한강 횡단 시)
    const tollOk = await checkAndPayBridgeToll(aptLat ?? null, aptLng ?? null);
    if (!tollOk.ok) {
      setBusy(false);
      if (tollOk.message) alert(tollOk.message);
      return;
    }
    const prev = liked;
    const prevC = count;
    setLiked(!prev);
    setCount(prevC + (prev ? -1 : 1));
    const { data, error } = await supabase.rpc('toggle_apt_discussion_like', { p_discussion_id: discussionId });
    setBusy(false);
    if (error) {
      setLiked(prev); setCount(prevC);
      alert(error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { out_liked: boolean; out_count: number; out_message: string | null } | undefined;
    if (!row) return;
    if (row.out_message) {
      setLiked(prev); setCount(prevC);
      alert(row.out_message);
      return;
    }
    setLiked(row.out_liked);
    setCount(row.out_count);
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || isAuthor}
        onMouseEnter={() => setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
        title={isAuthor ? '본인 리뷰엔 못 누름' : ''}
        className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[11px] font-bold cursor-pointer transition-all duration-150 disabled:cursor-not-allowed
          ${liked
            ? 'border-[#dc2626] bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2]'
            : 'border-border bg-white text-muted hover:border-[#dc2626] hover:text-[#dc2626]'}
          ${isAuthor ? 'opacity-50' : ''}
        `}
      >
        <span>찐리뷰</span>
        <svg
          width="11" height="11" viewBox="0 0 24 24"
          fill={liked ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth={2.2}
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <span className="tabular-nums">{count}</span>
      </button>
      {showHint && !isAuthor && (
        <span className="absolute z-50 bottom-full mb-1 left-1/2 -translate-x-1/2 w-[220px] bg-navy text-white text-[10px] leading-relaxed px-3 py-2 shadow-xl pointer-events-none">
          누를 때마다 <b className="text-cyan">작성자 +3 mlbg</b>.<br />
          찐리뷰 아닌데 누르면 누른 사람 <b className="text-[#fbbf24]">-1 mlbg</b>.
        </span>
      )}
    </span>
  );
}
