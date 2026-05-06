// 만료 경매 자동 종료 — Vercel Cron 으로 5분마다 호출.
// 기존엔 /api/active-auctions 가 매 요청마다 실행했는데,
// 25초 timeout 으로 죽으면 다음 호출이 같은 작업 반복 → death spiral → middleware 504 폭발.
// (2026-05-06 사고) cron 으로 분리.
//
// 인증: Vercel Cron 이 Authorization: Bearer ${CRON_SECRET} 자동 첨부.

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

// 경매 라이프사이클 cron — 5분마다.
// 1) 만료 경매 완료 처리 (complete_expired_auctions)
// 2) 알림 미발송 완료 경매 pop + 텔레그램 발송
// 3) home-feed 캐시 무효화
//
// 이전엔 페이지 마운트마다 /api/auction-cleanup 호출했으나 death spiral 사고로 cron 단일 진입점으로 통합 (2026-05-06).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 1) 만료 처리
  const { data: completedData, error: completeErr } = await sb.rpc('complete_expired_auctions');
  if (completeErr) {
    return NextResponse.json({ ok: false, stage: 'complete', error: completeErr.message }, { status: 500 });
  }
  const completedCount = Number(completedData ?? 0);

  // 2) 미알림 pop + telegram 알림
  const { data: rows } = await sb.rpc('pop_unnotified_completed_auctions', { p_limit: 20 }).then((r) => r, () => ({ data: null }));
  const list = (rows ?? []) as Array<{ id: number; asset_type: string; asset_name: string | null }>;
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  for (const row of list) {
    void fetch(`${base}/api/telegram/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'auction_completed', refId: row.id }),
    }).catch(() => { /* silent */ });
  }

  // 3) 캐시 무효화
  if (completedCount > 0 || list.length > 0) {
    revalidateTag('home-feed');
    revalidateTag('apt-master');
  }

  return NextResponse.json({ ok: true, completed: completedCount, notified: list.length });
}
