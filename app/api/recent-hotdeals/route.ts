import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

const fetchHotdeals = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('get_recent_hotdeals', { p_limit: 10 }).then((r) => r, () => ({ data: null }));
    return (data ?? []) as Array<{ post_id: number; title: string; author_name: string | null; created_at: string }>;
  },
  ['recent-hotdeals'],
  { revalidate: 60, tags: ['posts'] },
);

export async function GET() {
  const items = await fetchHotdeals();
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
}
