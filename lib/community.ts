import { createClient } from './supabase/server';
import { getCurrentUser, getCurrentProfile } from './auth';

export type PostCategory = 'community' | 'blog';

export type CommunityPost = {
  id: number;
  author_id: string;
  title: string;
  content: string;
  category: PostCategory;
  is_paid_only: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  author: { display_name: string | null; link_url?: string | null; tier?: string | null; tier_expires_at?: string | null; is_solo?: boolean | null; avatar_url?: string | null; apt_count?: number | null } | null;
  comment_count?: number;
  view_count?: number;
  like_count?: number;
};

export type CommunityComment = {
  id: number;
  post_id: number;
  author_id: string;
  parent_id: number | null;
  content: string;
  created_at: string;
  author: { display_name: string | null; link_url?: string | null; tier?: string | null; tier_expires_at?: string | null; is_solo?: boolean | null; avatar_url?: string | null; apt_count?: number | null } | null;
};

export async function listPosts(category: PostCategory = 'community', limit = 50): Promise<CommunityPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('posts')
    .select('id, author_id, title, content, category, is_paid_only, view_count, created_at, updated_at, author:profiles!author_id(display_name, link_url, tier, tier_expires_at, is_solo, avatar_url), comments(count)')
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listPosts error', error);
    return [];
  }
  return (data ?? []).map((p: Record<string, unknown>) => {
    const commentsArr = p.comments as Array<{ count: number }> | undefined;
    const commentCount = commentsArr?.[0]?.count ?? 0;
    const { comments, ...rest } = p;
    void comments;
    return { ...rest, comment_count: commentCount } as CommunityPost;
  });
}

export async function getPost(id: number, category?: PostCategory): Promise<CommunityPost | null> {
  const supabase = await createClient();
  // deleted_at 도 select — 삭제된 글은 페이지에서 별도 안내 (404 대신).
  // 컬럼이 없으면 (SQL 064 미적용) 그냥 무시되고 deleted_at = undefined.
  let q = supabase
    .from('posts')
    .select('id, author_id, title, content, category, is_paid_only, view_count, created_at, updated_at, deleted_at, author:profiles!author_id(display_name, link_url, tier, tier_expires_at, is_solo, avatar_url)')
    .eq('id', id);
  if (category) q = q.eq('category', category);
  const { data, error } = await q.maybeSingle();
  if (error || !data) {
    // 컬럼 없는 경우 fallback — deleted_at 빼고 다시 조회
    const { data: data2 } = await supabase
      .from('posts')
      .select('id, author_id, title, content, category, is_paid_only, view_count, created_at, updated_at, author:profiles!author_id(display_name, link_url, tier, tier_expires_at, is_solo, avatar_url)')
      .eq('id', id).maybeSingle();
    if (!data2) return null;
    return data2 as unknown as CommunityPost;
  }
  return data as unknown as CommunityPost;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return Boolean(profile?.is_admin);
}

export type CurrentUserAccess = {
  user_id: string | null;
  is_admin: boolean;
  tier: 'free' | 'paid';
  tier_expires_at: string | null;
};

export async function getCurrentUserAccess(): Promise<CurrentUserAccess> {
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()]);
  if (!user) {
    return { user_id: null, is_admin: false, tier: 'free', tier_expires_at: null };
  }
  const tier = (profile?.tier === 'paid' ? 'paid' : 'free') as 'free' | 'paid';
  const expires = profile?.tier_expires_at ?? null;
  // 만료 지났으면 free로 취급 (DB cron으로 정리되기 전 안전망)
  const effectiveTier = tier === 'paid' && expires && new Date(expires) < new Date() ? 'free' : tier;
  return {
    user_id: user.id,
    is_admin: Boolean(profile?.is_admin),
    tier: effectiveTier,
    tier_expires_at: expires,
  };
}

export function canViewPaidContent(access: CurrentUserAccess): boolean {
  return access.is_admin || access.tier === 'paid';
}

export async function listComments(postId: number): Promise<CommunityComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, author_id, parent_id, content, created_at, author:profiles!author_id(display_name, link_url, tier, tier_expires_at, is_solo, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listComments error', error);
    return [];
  }
  return (data ?? []) as unknown as CommunityComment[];
}

// 서버(Vercel UTC)·클라이언트 어디서 실행해도 KST 기준으로 표시
// Intl.DateTimeFormat with timeZone 사용
const KST_DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
});
const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function kstParts(d: Date) {
  const dp = KST_DATE.formatToParts(d).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const tp = KST_TIME.formatToParts(d).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return { year: dp.year, month: dp.month, day: dp.day, hour: tp.hour, minute: tp.minute, second: tp.second };
}

export function formatRelativeKo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일 전`;
  const p = kstParts(d);
  return `${p.year}.${p.month}.${p.day}`;
}

// SLRClub 스타일: 오늘이면 HH:MM:SS, 아니면 YYYY.MM.DD (KST 기준)
export function formatBoardTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dp = kstParts(d);
  const np = kstParts(now);
  const sameDay = dp.year === np.year && dp.month === np.month && dp.day === np.day;
  if (sameDay) return `${dp.hour}:${dp.minute}`;
  return `${dp.year}.${dp.month}.${dp.day}`;
}
