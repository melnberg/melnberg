import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

const fetchActivity = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc('get_today_activity').then((r) => r, () => ({ data: null }));
    const row = (Array.isArray(data) ? data[0] : data) as null | {
      posts_today: number; apt_posts_today: number; comments_today: number; apt_comments_today: number;
      new_users_today: number; checkins_today: number; claims_today: number;
    };
    return row;
  },
  ['today-activity'],
  { revalidate: 60, tags: ['posts', 'comments', 'apt-discussions', 'profiles'] },
);

export async function GET() {
  const stats = await fetchActivity();
  return NextResponse.json({ stats }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
}
