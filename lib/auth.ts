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

// FullProfile + mlbg_balance 까지 한 번에 — getCurrentMlbgBalance 가 이걸 재사용해서 round-trip 0 추가.
type ProfileFull = FullProfile & { mlbg_balance: number };
const getCurrentProfileFull = cache(async (): Promise<ProfileFull | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  // 모든 컬럼을 한 번에. 일부 컬럼 미적용 환경(SQL 마이그레이션 부족)에서 에러 시 base 만 fallback.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, tier, tier_expires_at, created_at, naver_id, link_url, phone, is_solo, bio, avatar_url, mlbg_balance')
    .eq('id', user.id)
    .maybeSingle();
  if (!error && data) {
    const d = data as Record<string, unknown>;
    return {
      ...(d as unknown as ProfileWithTier),
      naver_id: (d.naver_id as string | null) ?? null,
      link_url: (d.link_url as string | null) ?? null,
      phone: (d.phone as string | null) ?? null,
      is_solo: (d.is_solo as boolean | null) ?? false,
      bio: (d.bio as string | null) ?? null,
      avatar_url: (d.avatar_url as string | null) ?? null,
      mlbg_balance: typeof d.mlbg_balance === 'number' ? d.mlbg_balance : Number(d.mlbg_balance ?? 0),
    };
  }
  // fallback — 핵심 컬럼만
  const { data: base } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, tier, tier_expires_at, created_at')
    .eq('id', user.id)
    .maybeSingle();
  if (!base) return null;
  return {
    ...(base as unknown as ProfileWithTier),
    naver_id: null, link_url: null, phone: null, is_solo: false, bio: null, avatar_url: null,
    mlbg_balance: 0,
  };
});

export const getCurrentProfile = cache(async (): Promise<FullProfile | null> => {
  const full = await getCurrentProfileFull();
  if (!full) return null;
  const { mlbg_balance: _b, ...rest } = full;
  void _b;
  return rest;
});

// 적립 점수 (활동 기반, 추이 표시용 — get_user_score)
export const getCurrentScore = cache(async (): Promise<number> => {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_user_score', { p_user_id: user.id });
  return typeof data === 'number' ? data : Number(data ?? 0);
});

// 현재 보유 mlbg 잔액 — getCurrentProfileFull 의 cache 재사용 → round-trip 추가 0
export const getCurrentMlbgBalance = cache(async (): Promise<number> => {
  const full = await getCurrentProfileFull();
  return full?.mlbg_balance ?? 0;
});
