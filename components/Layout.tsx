import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile, getCurrentScore } from '@/lib/auth';
import Sidebar, { type SidebarUser, type SidebarRecentPost } from './Sidebar';
import FeedbackWidget from './FeedbackWidget';
import NotificationsBell from './NotificationsBell';

async function fetchRecentPosts(): Promise<SidebarRecentPost[]> {
  const supabase = await createClient();
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
}

export default async function Layout({ current, children }: { current?: string; children: React.ReactNode }) {
  // 모두 독립적인 쿼리 — 병렬 실행. cached 헬퍼라 페이지에서 또 호출해도 dedupe됨.
  const [user, profile, score, recentPosts] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
    getCurrentScore(),
    fetchRecentPosts(),
  ]);

  let sidebarUser: SidebarUser | null = null;
  if (user) {
    const expiresAt = profile?.tier_expires_at ?? null;
    const isPaid = profile?.tier === 'paid' && (!expiresAt || new Date(expiresAt) > new Date());
    sidebarUser = {
      name: profile?.display_name ?? (user.user_metadata?.display_name as string | undefined) ?? user.email?.split('@')[0] ?? '회원',
      email: user.email ?? '',
      score,
      isPaid,
    };
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar current={current} user={sidebarUser} recentPosts={recentPosts} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      <NotificationsBell />
      <FeedbackWidget />
    </div>
  );
}
