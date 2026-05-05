import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

const fetchActiveOffers = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('get_active_offers', { p_limit: 20 }).then((r) => r, () => ({ data: null }));
    return (data ?? []) as Array<{
      offer_id: number; apt_id: number; apt_nm: string | null;
      buyer_name: string | null; price: number; kind: string; created_at: string;
    }>;
  },
  ['active-offers'],
  { revalidate: 30, tags: ['apt-listing-offers'] },
);

export async function GET() {
  const offers = await fetchActiveOffers();
  return NextResponse.json({ offers }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=120' } });
}
