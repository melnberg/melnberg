// 만료 경매 자동 종료 — Vercel Cron 으로 5분마다 호출.
// 기존엔 /api/active-auctions 가 매 요청마다 실행했는데,
// 25초 timeout 으로 죽으면 다음 호출이 같은 작업 반복 → death spiral → middleware 504 폭발.
// (2026-05-06 사고) cron 으로 분리.
//
// 인증: Vercel Cron 이 Authorization: Bearer ${CRON_SECRET} 자동 첨부.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  const { data, error } = await sb.rpc('complete_expired_auctions');
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, completed: data });
}
