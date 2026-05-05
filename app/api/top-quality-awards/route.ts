import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

const fetchTopQuality = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('get_top_quality_awards', { p_limit: 10 }).then((r) => r, () => ({ data: null }));
    return (data ?? []) as Array<{
      kind: string; ref_id: number; earned: number; multiplier: number;
      title: string | null; apt_nm: string | null; author_name: string | null; created_at: string;
    }>;
  },
  ['top-quality-awards'],
  { revalidate: 120, tags: ['mlbg-awards'] },
);

export async function GET() {
  const items = await fetchTopQuality();
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=300' } });
}
