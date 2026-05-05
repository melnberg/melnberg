import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 자산 랭킹 top 10 — mlbg 잔액 + 보유 단지 분양가 합. 30초 캐싱.
const fetchWealthRanking = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc('get_wealth_ranking', { p_limit: 10 });
    if (error || !data) return [];
    return (data as Array<{ user_id: string; display_name: string; total_wealth: number; mlbg_balance: number; apt_value: number; apt_count: number }>);
  },
  ['wealth-ranking-top10'],
  { revalidate: 30, tags: ['profiles', 'apt-master'] },
);

export async function GET() {
  const ranking = await fetchWealthRanking();
  return NextResponse.json({ ranking }, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' },
  });
}
