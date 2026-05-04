import { createClient } from '@/lib/supabase/server';
import Sidebar, { type SidebarUser } from './Sidebar';
import FeedbackWidget from './FeedbackWidget';

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

  return (
    <div className="flex min-h-screen">
      <Sidebar current={current} user={sidebarUser} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      <FeedbackWidget />
    </div>
  );
}
