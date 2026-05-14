// 위장 모드용 피드 — 최근 게시글 + 작성자 + 카테고리.
// BossMode 가 Excel/한글/Word UI 의 본문을 실제 피드로 채우는 데 사용.

import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';

const CATEGORY_TEAM: Record<string, string> = {
  community: '운영지원팀',
  hotdeal: '구매팀',
  stocks: '재무전략팀',
  realty: '자산운용팀',
  worry: '인사총무팀',
  coin: '디지털자산팀',
  blog: '경영지원팀',
};

export async function GET() {
  const sb = createPublicClient();
  try {
    const { data: posts } = await sb
      .from('posts')
      .select('id, author_id, title, content, category, like_count, view_count, created_at')
      .is('deleted_at', null)
      .in('category', ['community', 'hotdeal', 'stocks', 'realty', 'worry', 'coin', 'love'])
      .order('created_at', { ascending: false })
      .limit(100);
    const list = (posts ?? []) as Array<{
      id: number;
      author_id: string;
      title: string;
      content: string;
      category: string;
      like_count: number | null;
      view_count: number | null;
      created_at: string;
    }>;

    const authorIds = Array.from(new Set(list.map((p) => p.author_id)));
    const profMap = new Map<string, string>();
    if (authorIds.length > 0) {
      const { data: profs } = await sb
        .from('profiles')
        .select('id, display_name')
        .in('id', authorIds);
      for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
        profMap.set(p.id, p.display_name ?? '익명');
      }
    }

    // 댓글 수 — best effort
    const commCnt = new Map<number, number>();
    if (list.length > 0) {
      const { data: comms } = await sb
        .from('comments')
        .select('post_id')
        .in('post_id', list.map((p) => p.id))
        .is('deleted_at', null);
      for (const c of (comms ?? []) as Array<{ post_id: number }>) {
        commCnt.set(c.post_id, (commCnt.get(c.post_id) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      ok: true,
      posts: list.map((p) => ({
        id: p.id,
        title: p.title,
        // 본문 — 첫 줄 + 너무 길면 자름. URL 만 들어간 이미지 줄은 제거.
        excerpt: (p.content ?? '')
          .split('\n')
          .filter((s) => s.trim() && !/^https?:\/\//.test(s.trim()))
          .slice(0, 3)
          .join(' ')
          .slice(0, 220),
        category: p.category,
        team: CATEGORY_TEAM[p.category] ?? '경영지원팀',
        author: profMap.get(p.author_id) ?? '익명',
        like: p.like_count ?? 0,
        view: p.view_count ?? 0,
        comments: commCnt.get(p.id) ?? 0,
        created_at: p.created_at,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fail' }, { status: 502 });
  }
}
