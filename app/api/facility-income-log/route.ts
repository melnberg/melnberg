import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/facility-income-log?type=factory&id=123 → 본인의 해당 시설 최근 7일 지급 내역.
// type ∈ {'emart','factory','restaurant','kids'}, id 는 facility_id (emart 는 무시)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get('type');
  const idStr = sp.get('id');
  if (!type || !['emart', 'factory', 'restaurant', 'kids'].includes(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);

  let q = sb.from('facility_income_log')
    .select('paid_for_date, amount')
    .eq('user_id', user.id)
    .eq('facility_type', type)
    .gte('paid_for_date', sinceStr)
    .order('paid_for_date', { ascending: false });

  if (type !== 'emart' && idStr) {
    q = q.eq('facility_id', Number(idStr));
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [] });
}
