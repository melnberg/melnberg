import { createClient } from '@/lib/supabase/server';
import Sidebar, { type SidebarUser } from './Sidebar';

export default async function Layout({ current, children }: { current?: string; children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let sidebarUser: SidebarUser | null = null;
  if (user) {
    const { data: scoreData } = await supabase.rpc('get_user_score', { p_user_id: user.id });
    const score = typeof scoreData === 'number' ? scoreData : Number(scoreData ?? 0);
    sidebarUser = {
      name: (user.user_metadata?.display_name as string | undefined) ?? user.email?.split('@')[0] ?? '회원',
      email: user.email ?? '',
      score,
    };
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar current={current} user={sidebarUser} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
