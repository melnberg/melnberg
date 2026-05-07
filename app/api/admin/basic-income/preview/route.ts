import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 기본소득 미리보기 — 구간별 인원 수 + 지급액 합. 실제 지급 X.
// body: { tiers: [{ pct: number, amount: number }, ...] }
export async function POST(req: NextRequest) {
  let body: { tiers?: Array<{ pct: number; amount: number }> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }

  const tiers = body.tiers ?? [];
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return NextResponse.json({ error: 'tiers 필수' }, { status: 400 });
  }

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

  // RPC 는 호출자 권한 (auth.uid()) 으로 admin check 하므로 user-scope client 로 호출
  const { data, error } = await sb.rpc('preview_basic_income', { p_tiers: tiers });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
