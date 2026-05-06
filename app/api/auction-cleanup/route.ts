import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 경매 라이프사이클 정리:
// 1) 만료 경매 완료 처리 (complete_expired_auctions)
// 2) 알림 미발송 완료 경매 pop + 텔레그램 발송 (auction_completed)
// 3) home-feed 캐시 무효화
//
// public 호출 가능 (인증 X). DB level 에서 status/notified_at 으로 1회성 보장 → 중복 알림 없음.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return GET(req);
}

export async function GET(req: Request) {
  const supabase = createPublicClient();
  // 1) 만료 처리
  const completeRes = await supabase.rpc('complete_expired_auctions').then((r) => r, () => null);
  const completedCount = Number((completeRes as { data?: number })?.data ?? 0);

  // 2) 미알림 완료 경매 pop + TG 발송
  const { data: rows } = await supabase
    .rpc('pop_unnotified_completed_auctions', { p_limit: 20 })
    .then((r) => r, () => ({ data: null }));
  const list = (rows ?? []) as Array<{ id: number; asset_type: string; asset_name: string | null }>;
  // 베이스 URL 결정 — Vercel 환경에선 host header 사용
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  for (const row of list) {
    void fetch(`${base}/api/telegram/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'auction_completed', refId: row.id }),
    }).catch(() => { /* silent — 알림 실패 시 notified_at 은 이미 마킹됐지만 재발송 옵션은 어드민 수동 */ });
  }

  // 3) 캐시 무효화
  if (completedCount > 0 || list.length > 0) {
    revalidateTag('home-feed');
    revalidateTag('apt-master');
  }

  return NextResponse.json({
    completed_count: completedCount,
    notified_count: list.length,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
