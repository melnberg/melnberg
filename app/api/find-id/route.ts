import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 3) return local[0] + '*'.repeat(Math.max(0, local.length - 1)) + '@' + domain;
  return local.slice(0, 3) + '*'.repeat(Math.max(0, local.length - 3)) + '@' + domain;
}

export async function POST(req: NextRequest) {
  const { naverId, displayName } = await req.json();
  const naverIdT = (naverId ?? '').trim();
  const nameT = (displayName ?? '').trim();
  if (!naverIdT && !nameT) {
    return NextResponse.json({ error: '네이버 ID 또는 닉네임을 입력해주세요.' }, { status: 400 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  let q = sb.from('profiles').select('id');
  if (naverIdT) q = q.eq('naver_id', naverIdT);
  else q = q.eq('display_name', nameT);
  const { data: profs } = await q.limit(5);

  if (!profs || profs.length === 0) {
    return NextResponse.json({ found: false });
  }

  // auth.users 에서 이메일 찾기
  const masks: string[] = [];
  for (const p of profs) {
    try {
      const { data } = await sb.auth.admin.getUserById(p.id as string);
      const email = data?.user?.email;
      if (email) masks.push(maskEmail(email));
    } catch { /* ignore */ }
  }
  if (masks.length === 0) return NextResponse.json({ found: false });
  return NextResponse.json({ found: true, emails: masks });
}
