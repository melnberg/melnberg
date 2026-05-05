import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 거래 활발 단지 TOP 10 (3개월) — 5분 캐싱 (느린 갱신 OK)
const fetchHotApts = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('get_most_traded_apts', { p_months: 3, p_limit: 10 })
      .then((r) => r, () => ({ data: null }));
    return (data ?? []) as Array<{ apt_id: number | null; apt_nm: string; trade_count: number; median_amount: number; last_deal_date: string }>;
  },
  ['most-traded-apts'],
  { revalidate: 300, tags: ['apt-trades'] },
);

export async function GET() {
  const apts = await fetchHotApts();
  return NextResponse.json({ apts }, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
  });
}
