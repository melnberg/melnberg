import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// 이메일 가입 중복 확인.
// Supabase 는 미인증 상태(email_confirmed_at = null) 의 같은 이메일 재가입을
// "성공"으로 응답하므로(확인 메일만 새로 보냄), 가입 폼 사전에 명확히 거부할 필요.

export async function POST(request: NextRequest) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: string };
  const e = (email ?? '').trim().toLowerCase();
  if (!e || !e.includes('@')) {
    return NextResponse.json({ exists: false });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ exists: false, error: 'misconfig' }, { status: 500 });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // listUsers 는 페이지네이션 — 사용자 적을 때 단순 조회. 많아지면 별도 SQL 함수로 교체.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
  }
  const found = data.users.some((u) => u.email?.toLowerCase() === e);
  return NextResponse.json({ exists: found });
}
