import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 스코어 랭킹 top 5 — 30초 캐싱
const fetchRanking = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('get_top_scorers', { p_limit: 5 });
    return (data ?? []) as Array<{ user_id: string; display_name: string; score: number }>;
  },
  ['score-ranking-top5'],
  { revalidate: 30, tags: ['profiles', 'apt-discussions', 'posts'] },
);

export async function GET() {
  const ranking = await fetchRanking();
  return NextResponse.json({ ranking }, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' },
  });
}
