// 자산 순위 일일 스냅샷 — 매일 아침 KST 7시 (= UTC 22시) 실행.
// snapshot_wealth_ranking() RPC 가 오늘 날짜로 1등~끝까지 저장.
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

  const { data, error } = await sb.rpc('snapshot_wealth_ranking');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, inserted: data ?? 0 });
}
