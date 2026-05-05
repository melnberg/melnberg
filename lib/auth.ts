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
  bio: string | null;
  avatar_url: string | null;
};

export const getCurrentProfile = cache(async (): Promise<FullProfile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  // 핵심 컬럼 — schema.sql + 초기 마이그레이션부터 항상 존재
  const { data: base, error } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, tier, tier_expires_at, created_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !base) return null;

  // 확장 컬럼 — best-effort. 일부 마이그레이션 미적용이어도 is_admin/tier 는 살림.
  const { data: ext } = await supabase
    .from('profiles')
    .select('naver_id, link_url, phone, is_solo, bio, avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  const e = (ext ?? {}) as { naver_id?: string | null; link_url?: string | null; phone?: string | null; is_solo?: boolean | null; bio?: string | null; avatar_url?: string | null };

  return {
    ...(base as unknown as ProfileWithTier),
    naver_id: e.naver_id ?? null,
    link_url: e.link_url ?? null,
    phone: e.phone ?? null,
    is_solo: e.is_solo ?? false,
    bio: e.bio ?? null,
    avatar_url: e.avatar_url ?? null,
  };
});

// 적립 점수 (활동 기반, 추이 표시용 — get_user_score)
export const getCurrentScore = cache(async (): Promise<number> => {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_user_score', { p_user_id: user.id });
  return typeof data === 'number' ? data : Number(data ?? 0);
});

// 현재 보유 mlbg 잔액 (저장된 값)
export const getCurrentMlbgBalance = cache(async (): Promise<number> => {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('mlbg_balance').eq('id', user.id).maybeSingle();
  const v = (data as { mlbg_balance?: number | string | null } | null)?.mlbg_balance;
  return typeof v === 'number' ? v : Number(v ?? 0);
});
