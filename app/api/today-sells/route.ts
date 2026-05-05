import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

const fetchSells = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('get_today_sells', { p_limit: 10 }).then((r) => r, () => ({ data: null }));
    return (data ?? []) as Array<{
      apt_id: number; apt_nm: string | null; buyer_name: string | null; seller_name: string | null;
      price: number; occurred_at: string;
    }>;
  },
  ['today-sells'],
  { revalidate: 30, tags: ['apt-occupier-events'] },
);

export async function GET() {
  const sells = await fetchSells();
  return NextResponse.json({ sells }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
}
