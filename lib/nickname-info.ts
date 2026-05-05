// NicknameInfo 빌더 — 모든 닉네임 표기는 이 헬퍼만 통하면 일관 유지.
// 새 필드(예: 등급별 색·뱃지) 추가할 때 여기 한 곳만 수정하면 모든 곳 반영됨.
import type { NicknameInfo } from '@/components/Nickname';

export type ProfileLike = {
  display_name?: string | null;
  link_url?: string | null;
  tier?: string | null;
  tier_expires_at?: string | null;
  is_solo?: boolean | null;
  avatar_url?: string | null;
  apt_count?: number | null;
};

export type FeedAuthorLike = {
  author_id?: string | null;
  author_name?: string | null;
  author_link?: string | null;
  author_is_paid?: boolean;
  author_is_solo?: boolean;
  author_avatar_url?: string | null;
  author_apt_count?: number | null;
};

// joined profile (author:profiles!author_id(...)) → NicknameInfo
export function profileToNicknameInfo(
  profile: ProfileLike | null | undefined,
  userId?: string | null,
): NicknameInfo {
  const isPaid =
    profile?.tier === 'paid' &&
    (!profile.tier_expires_at || new Date(profile.tier_expires_at).getTime() > Date.now());
  return {
    name: profile?.display_name ?? null,
    link: profile?.link_url ?? null,
    isPaid,
    isSolo: !!profile?.is_solo,
    userId: userId ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    aptCount: profile?.apt_count ?? null,
  };
}

// 플랫 피드 아이템 (author_*) → NicknameInfo
export function feedItemToNicknameInfo(item: FeedAuthorLike): NicknameInfo {
  return {
    name: item.author_name ?? null,
    link: item.author_link ?? null,
    isPaid: !!item.author_is_paid,
    isSolo: !!item.author_is_solo,
    userId: item.author_id ?? null,
    avatarUrl: item.author_avatar_url ?? null,
    aptCount: item.author_apt_count ?? null,
  };
}
