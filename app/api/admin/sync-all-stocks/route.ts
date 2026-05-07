// 어드민 수동 트리거 — 전체 KOSPI/KOSDAQ 종목 동기화.
// CRON_SECRET 없이 admin 인증으로.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { syncAllStocks } from '@/app/api/cron/sync-all-stocks/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(_req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!(prof as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: '어드민만 가능' }, { status: 403 });
  }

  const result = await syncAllStocks();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
