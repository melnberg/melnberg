'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// 글 좋아요 (하트) 버튼.
// 클릭 → toggle_post_like RPC → 빨간 하트 + count +1 (혹은 회색 + -1).
// 비로그인은 alert 후 로그인 안내.
export default function PostLikeButton({
  postId,
  initialCount,
}: {
  postId: number;
  initialCount: number;
}) {
  const supabase = createClient();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // 본인이 이미 좋아요했는지 mount 시 체크
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id ?? null);
      if (user) {
        const { data } = await supabase
          .from('post_likes')
          .select('post_id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (!cancelled && data) setLiked(true);
      }
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, [postId, supabase]);

  async function handleClick() {
    if (busy) return;
    if (!userId) { alert('좋아요는 로그인 후 가능해요.'); return; }
    setBusy(true);
    // 낙관적 UI — 즉시 토글
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    const { data, error } = await supabase.rpc('toggle_post_like', { p_post_id: postId });
    setBusy(false);
    if (error) {
      // rollback
      setLiked(prevLiked); setCount(prevCount);
      alert(error.message);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { out_liked: boolean; out_count: number; out_message: string | null } | undefined;
    if (!row) return;
    if (row.out_message) {
      // server-side 검증 실패 — rollback + 안내
      setLiked(prevLiked); setCount(prevCount);
      alert(row.out_message);
      return;
    }
    setLiked(row.out_liked);
    setCount(row.out_count);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || !authChecked}
      aria-label={liked ? '좋아요 취소' : '좋아요'}
      aria-pressed={liked}
      className={`inline-flex items-center gap-1 px-2 py-1 border cursor-pointer transition-all duration-150 disabled:cursor-wait
        ${liked
          ? 'border-[#dc2626] bg-[#fef2f2] text-[#dc2626] hover:bg-[#fee2e2]'
          : 'border-border bg-white text-muted hover:border-[#dc2626] hover:text-[#dc2626]'}
      `}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={liked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={liked ? 'scale-110' : ''}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span className="text-[12px] font-bold tabular-nums">{count}</span>
    </button>
  );
}
