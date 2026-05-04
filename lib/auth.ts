import { cache } from 'react';
import { createClient } from './supabase/server';
import type { ProfileWithTier } from './tier-utils';

// 한 RSC 요청 내 동일 함수 호출은 React가 dedupe — Supabase 왕복 1회로 줄임.
// Layout 과 페이지가 같은 user/profile/score 를 각자 받아도 실제 쿼리는 한 번만 나감.

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export type FullProfile = ProfileWithTier & {
  naver_id: string | null;
  link_url: string | null;
  phone: string | null;
  is_solo: boolean | null;
};

export const getCurrentProfile = cache(async (): Promise<FullProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, tier, tier_expires_at, created_at, naver_id, link_url, phone, is_solo')
    .eq('id', user.id)
    .maybeSingle();
  return (data as FullProfile | null) ?? null;
});

export const getCurrentScore = cache(async (): Promise<number> => {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_user_score', { p_user_id: user.id });
  return typeof data === 'number' ? data : Number(data ?? 0);
});
