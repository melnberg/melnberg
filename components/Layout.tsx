import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { getCurrentUser, getCurrentProfile, getCurrentMlbgBalance } from '@/lib/auth';
import Sidebar, { type SidebarUser, type SidebarRecentPost, type BoardLatest } from './Sidebar';
import FeedbackWidget from './FeedbackWidget';
import TelegramFloatingLink from './TelegramFloatingLink';
import FloatingMapPin from './FloatingMapPin';
import LiveActivityToaster from './LiveActivityToaster';
import MobileTopBar from './MobileTopBar';
import GreetingBonusBanner from './GreetingBonusBanner';
import WealthSurgeBoard from './WealthSurgeBoard';

// 사이드바 최신글 — 120초 캐싱 (모든 페이지 공통). DB 부하 감소 위해 30→120 확대 (2026-05-06).
// 새 글 작성 시 revalidateTag('posts') 로 즉시 갱신되므로 사용자 체감 거의 없음.
const fetchRecentPosts = unstable_cache(
  async (): Promise<SidebarRecentPost[]> => {
    const supabase = createPublicClient();
    const { data: recentRaw } = await supabase
      .from('posts')
      .select('id, title, created_at, author:profiles!author_id(display_name)')
      .eq('category', 'community')
      .order('created_at', { ascending: false })
      .limit(5);
    return (recentRaw ?? []).map((p) => {
      const author = (p as Record<string, unknown>).author as { display_name?: string | null } | null;
      return {
        id: p.id as number,
        title: p.title as string,
        created_at: p.created_at as string,
        author_name: author?.display_name ?? null,
      };
    });
  },
  ['sidebar-recent-posts'],
  { revalidate: 120, tags: ['posts'] },
);

// 사이드바 게시판 새 글 빨간점 — 5개 게시판의 가장 최근 글 created_at 만 가져옴.
// 60초 캐싱 + revalidateTag('posts') 로 글 작성 시 즉시 갱신.
const fetchBoardLatest = unstable_cache(
  async (): Promise<BoardLatest> => {
    const sb = createPublicClient();
    const safe = <T,>(p: PromiseLike<T>): Promise<T | { data: null }> =>
      Promise.resolve(p).then((x) => x as T | { data: null }, () => ({ data: null }));
    const [c, r, s, rest, kids] = await Promise.all([
      safe(sb.from('posts').select('created_at').eq('category', 'community').is('deleted_at', null).order('created_at', { ascending: false }).limit(1)),
      safe(sb.from('posts').select('created_at').eq('category', 'realty').is('deleted_at', null).order('created_at', { ascending: false }).limit(1)),
      safe(sb.from('posts').select('created_at').eq('category', 'stocks').is('deleted_at', null).order('created_at', { ascending: false }).limit(1)),
      safe(sb.from('restaurant_pins').select('created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(1)),
      safe(sb.from('kids_pins').select('created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(1)),
    ]);
    const pick = (resp: { data: unknown }) => {
      const arr = (resp as { data: Array<{ created_at?: string }> | null }).data;
      return arr && arr[0]?.created_at ? arr[0].created_at : null;
    };
    return {
      community: pick(c),
      realty: pick(r),
      stocks: pick(s),
      restaurants: pick(rest),
      kids: pick(kids),
    };
  },
  ['sidebar-board-latest-v1'],
  { revalidate: 60, tags: ['posts', 'restaurants', 'kids'] },
);

// Supabase 부하 시 Layout 이 페이지 전체를 막는 사고 방어 (2026-05-06).
// 각 호출 5초 안에 못 끝나면 안전한 기본값으로 fallback.
function withTimeout<T>(p: Promise<T>, fallback: T, ms = 5000): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function Layout({ current, children }: { current?: string; children: React.ReactNode }) {
  // 모두 독립적인 쿼리 — 병렬 실행. cached 헬퍼라 페이지에서 또 호출해도 dedupe됨.
  const emptyBoardLatest: BoardLatest = { community: null, realty: null, stocks: null, restaurants: null, kids: null };
  const [user, profile, balance, recentPosts, boardLatest] = await Promise.all([
    withTimeout(getCurrentUser(), null),
    withTimeout(getCurrentProfile(), null),
    withTimeout(getCurrentMlbgBalance(), 0),
    withTimeout(fetchRecentPosts(), []),
    withTimeout(fetchBoardLatest(), emptyBoardLatest, 3000),
  ]);

  let sidebarUser: SidebarUser | null = null;
  if (user) {
    const expiresAt = profile?.tier_expires_at ?? null;
    const isPaid = profile?.tier === 'paid' && (!expiresAt || new Date(expiresAt) > new Date());
    sidebarUser = {
      name: profile?.display_name ?? (user.user_metadata?.display_name as string | undefined) ?? user.email?.split('@')[0] ?? '회원',
      email: user.email ?? '',
      balance,
      isPaid,
      isAdmin: !!profile?.is_admin,
      avatarUrl: profile?.avatar_url ?? null,
    };
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar current={current} user={sidebarUser} recentPosts={recentPosts} boardLatest={boardLatest} />
      <main className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar />
        {/* 자산 급등 전광판 — 일시 가림. 다시 켜려면 아래 한 줄 주석 해제. */}
        {/* <WealthSurgeBoard /> */}
        <GreetingBonusBanner />
        {children}
      </main>
      <TelegramFloatingLink />
      <FeedbackWidget />
      <FloatingMapPin />
      <LiveActivityToaster />
    </div>
  );
}
