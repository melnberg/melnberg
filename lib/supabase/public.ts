import { createClient } from '@supabase/supabase-js';

// 쿠키/세션 의존 없는 공개 읽기용 클라이언트.
// unstable_cache 안에서는 dynamic API (cookies/headers) 사용 불가 → 이 클라이언트 써야 함.
// anon key 라 RLS 가 적용됨 (public 읽기 정책 있는 테이블만 접근 가능).
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
