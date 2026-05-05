'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// 글 조회수 +1 (클라이언트 측). 같은 세션 안에서 같은 글은 1회만 증가.
// 서버 컴포넌트에서 호출하면 Next.js prefetch / router.refresh / RSC 재실행으로
// 한 번 진입에 2~3회 발화되어 조회수가 2~3부터 시작하는 문제가 있음.
export default function PostViewCounter({ postId }: { postId: number }) {
  useEffect(() => {
    const key = `pv_${postId}`;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const supabase = createClient();
    void supabase.rpc('increment_post_view', { p_post_id: postId }).then(() => {}, () => {});
  }, [postId]);
  return null;
}
