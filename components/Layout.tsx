import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { getCurrentUser, getCurrentProfile, getCurrentMlbgBalance } from '@/lib/auth';
import Sidebar, { type SidebarUser, type BoardLatest } from './Sidebar';
import FeedbackWidget from './FeedbackWidget';
import TelegramFloatingLink from './TelegramFloatingLink';
import FloatingMapPin from './FloatingMapPin';
import LiveActivityToaster from './LiveActivityToaster';
import MobileTopBar from './MobileTopBar';
import GreetingBonusBanner from './GreetingBonusBanner';
// WealthSurgeBoard — 일시 가림 상태. 부활 시 import 복구 후 line 107 주석 해제.
// import WealthSurgeBoard from './WealthSurgeBoard';

// fetchRecentPosts — 사이드바 최근글 리스트 노출 폐지 후 dead. 제거됨 (2026-05-07).
// Sidebar 가 recentPosts prop 더 이상 받지 않음.

// 사이드바 게시판 새 글 빨간점 — 5개 게시판의 가장 최근 created_at 단일 RPC 로 반환.
// 단일 round-trip (이전 5개 병렬 → 1개) — SSR latency 감소.
// RPC 시그니처: supabase/173_board_latest_posts.sql 참고. 사용자가 Supabase Studio 에서 한 번 실행 필요.
// 60초 캐싱 + revalidateTag('posts') 로 글 작성 시 즉시 갱신.
const fetchBoardLatest = unstable_cache(
  async (): Promise<BoardLatest> => {
    const sb = createPublicClient();
    const empty: BoardLatest = { community: null, realty: null, stocks: null, restaurants: null, kids: null };
    try {
      const { data, error } = await sb.rpc('get_board_latest_posts');
      if (error || !data) return empty;
      // RPC 가 returns table 이라 array 로 옴. 첫 행만 사용.
      const row = (Array.isArray(data) ? data[0] : data) as Partial<BoardLatest> | null;
      if (!row) return empty;
      return {
        community: row.community ?? null,
        realty: row.realty ?? null,
        stocks: row.stocks ?? null,
        restaurants: row.restaurants ?? null,
        kids: row.kids ?? null,
      };
    } catch {
      return empty;
    }
  },
  ['sidebar-board-latest-v2'],
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
  const [user, profile, balance, boardLatest] = await Promise.all([
    withTimeout(getCurrentUser(), null),
    withTimeout(getCurrentProfile(), null),
    withTimeout(getCurrentMlbgBalance(), 0),
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
      <Sidebar current={current} user={sidebarUser} boardLatest={boardLatest} />
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
