import { createClient } from '@/lib/supabase/server';
import Sidebar, { type SidebarUser, type SidebarRecentPost } from './Sidebar';
import FeedbackWidget from './FeedbackWidget';
import NotificationsBell from './NotificationsBell';

export default async function Layout({ current, children }: { current?: string; children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let sidebarUser: SidebarUser | null = null;
  if (user) {
    const [{ data: scoreData }, { data: profile }] = await Promise.all([
      supabase.rpc('get_user_score', { p_user_id: user.id }),
      supabase.from('profiles').select('tier, tier_expires_at').eq('id', user.id).maybeSingle(),
    ]);
    const score = typeof scoreData === 'number' ? scoreData : Number(scoreData ?? 0);
    const tier = (profile as { tier?: string | null } | null)?.tier;
    const expiresAt = (profile as { tier_expires_at?: string | null } | null)?.tier_expires_at;
    const isPaid = tier === 'paid' && (!expiresAt || new Date(expiresAt) > new Date());
    sidebarUser = {
      name: (user.user_metadata?.display_name as string | undefined) ?? user.email?.split('@')[0] ?? '회원',
      email: user.email ?? '',
      score,
      isPaid,
    };
  }

  // 사이드바 커뮤니티 최신글 5개 (작성자 닉네임 포함)
  const { data: recentRaw } = await supabase
    .from('posts')
    .select('id, title, created_at, author:profiles!author_id(display_name)')
    .eq('category', 'community')
    .order('created_at', { ascending: false })
    .limit(5);
  const recentPosts: SidebarRecentPost[] = (recentRaw ?? []).map((p) => {
    const author = (p as Record<string, unknown>).author as { display_name?: string | null } | null;
    return {
      id: p.id as number,
      title: p.title as string,
      created_at: p.created_at as string,
      author_name: author?.display_name ?? null,
    };
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar current={current} user={sidebarUser} recentPosts={recentPosts} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      <NotificationsBell />
      <FeedbackWidget />
    </div>
  );
}
