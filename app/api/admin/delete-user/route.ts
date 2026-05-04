import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId: string | undefined = body?.user_id;
  if (!userId) return NextResponse.json({ error: 'user_id 필요' }, { status: 400 });

  // 호출자가 관리자인지 검증
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { data: prof } = await sb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!prof?.is_admin) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });

  if (userId === user.id) return NextResponse.json({ error: '본인 계정은 여기서 삭제할 수 없습니다.' }, { status: 400 });

  // 실제 삭제 (auth.users → 연쇄로 profiles, posts 등 ON DELETE CASCADE/SET NULL)
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
