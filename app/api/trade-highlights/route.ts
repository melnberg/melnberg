import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 최근 7일 거래 하이라이트 — 60초 캐싱
const fetchTradeHighlights = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('get_recent_trade_highlights', { p_limit: 20 })
      .then((r) => r, () => ({ data: null }));
    return (data ?? []) as Array<{ apt_nm: string; umd_nm: string | null; deal_amount: number; excl_use_ar: number; deal_date: string }>;
  },
  ['trade-highlights'],
  { revalidate: 60, tags: ['apt-trades'] },
);

export async function GET() {
  const trades = await fetchTradeHighlights();
  return NextResponse.json({ trades }, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
  });
}
