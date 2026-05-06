import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabase = createPublicClient();
  // 만료 경매 자동 종료는 /api/cron/complete-auctions 으로 이전 (read-only 만 유지).
  // 매 요청마다 실행 시 25초 timeout death spiral → middleware 504 폭발 (2026-05-06 사고).
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
