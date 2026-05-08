'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// 우상단 "베팅중" 배지 — 6시간 이내 생성 + status='open' 인 폴 카운트.
// FeedbackWidget(top-2 right-2) 옆에 위치. 0건이면 표시 안 함.
export default function FloatingBettingBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
        const { data, error } = await supabase
          .from('post_polls')
          .select('post_id')
          .eq('status', 'open')
          .gte('created_at', sixHoursAgo)
          .limit(50);
        if (!alive) return;
        if (error || !data) {
          setCount(0);
          return;
        }
        const ids = data.map((d: { post_id: number }) => d.post_id);
        if (ids.length === 0) { setCount(0); return; }
        // 삭제된 글의 폴은 제외
        const { data: posts } = await supabase
          .from('posts')
          .select('id, deleted_at')
          .in('id', ids);
        if (!alive) return;
        const aliveCount = ((posts ?? []) as Array<{ id: number; deleted_at: string | null }>)
          .filter((p) => !p.deleted_at).length;
        setCount(aliveCount);
      } catch {
        if (alive) setCount(0);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (count == null || count === 0) return null;

  return (
    <Link
      href="/bets-active"
      aria-label="진행 중 베팅 보기"
      className="floating-widget fixed top-2 right-12 z-50 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-white no-underline rounded-full shadow-md hover:opacity-90 transition-opacity"
      style={{
        background: 'linear-gradient(90deg, #fbbf24 0%, #ec4899 50%, #8b5cf6 100%)',
        border: '1.5px solid white',
      }}
    >
      <span>🎰 베팅중</span>
      <span className="bg-white/30 px-1.5 py-px rounded-full text-[11px] tabular-nums">
        {count}
      </span>
    </Link>
  );
}
