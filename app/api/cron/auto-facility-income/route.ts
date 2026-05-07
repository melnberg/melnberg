// 상업시설 일별 수익 자동 지급 — 매일 KST 8:00 (= UTC 23:00) 실행.
// auto_distribute_facility_income() RPC 가 4개 시설 일괄 처리 + 사용자 알림.

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

  const { data, error } = await sb.rpc('auto_distribute_facility_income');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const row = (Array.isArray(data) ? data[0] : data) as
    | { out_total_recipients: number; out_total_paid: number; out_notifications_sent: number }
    | undefined;

  return NextResponse.json({
    ok: true,
    recipients: row?.out_total_recipients ?? 0,
    totalPaid: row?.out_total_paid ?? 0,
    notifications: row?.out_notifications_sent ?? 0,
  });
}
