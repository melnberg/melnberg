// 포춘쿠키 — 오늘치 강제 삭제 (관리자 테스트용).
// 본인 row 만 hard-delete. 관리자(is_admin=true) 만 호출 가능.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const { data: prof } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!(prof as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: '관리자만' }, { status: 403 });
  }

  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const { error, count } = await supabase
    .from('fortune_cookies')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
    .eq('drawn_date', today);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
