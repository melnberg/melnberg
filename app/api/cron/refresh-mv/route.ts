// 머터리얼라이즈드 뷰 일일 refresh — apt_representative_price_mv + apt_pyeong_avg
// 매일 한국 새벽 4시 실행 (사용자 적은 시간).
// 인증: Vercel Cron 이 Authorization: Bearer ${CRON_SECRET} 자동 첨부.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

  const results: Record<string, string> = {};
  const { error: e1 } = await sb.rpc('refresh_apt_representative_price');
  results.apt_representative_price = e1 ? `error: ${e1.message}` : 'ok';

  const { error: e2 } = await sb.rpc('refresh_apt_pyeong_avg');
  results.apt_pyeong_avg = e2 ? `error: ${e2.message}` : 'ok';

  return NextResponse.json({ ok: true, results });
}
