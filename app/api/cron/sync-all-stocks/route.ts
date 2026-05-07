// 전체 KOSPI + KOSDAQ 종목 일괄 동기화 — 매일 KST 17:30 cron.
// 실 로직은 lib/sync-all-stocks.ts (admin 라우트와 공유).

import { NextRequest, NextResponse } from 'next/server';
import { syncAllStocks } from '@/lib/sync-all-stocks';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await syncAllStocks();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
