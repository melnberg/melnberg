import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabase = createPublicClient();
  // 만료 경매 자동 종료
  await supabase.rpc('complete_expired_auctions').then((r) => r, () => null);
  const { data } = await supabase
    .rpc('list_recent_auctions', { p_limit: 30 })
    .then((r) => r, () => ({ data: null }));
  const all = (data ?? []) as Array<{
    id: number; apt_id: number; apt_nm: string | null;
    starts_at: string; ends_at: string;
    min_bid: number; current_bid: number | null; current_bidder_name: string | null;
    status: string; bid_count: number;
  }>;
  const active = all.filter((a) => a.status === 'active');
  return NextResponse.json({ auctions: active }, { headers: { 'Cache-Control': 'no-store' } });
}
