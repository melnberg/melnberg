import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AptMasterAdmin from '@/components/AptMasterAdmin';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: '아파트 마스터 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default async function AptMasterAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/apt-master');
  if (!(await isCurrentUserAdmin())) redirect('/');

  // 카운트만 미리 — 클라이언트가 필터별로 다시 fetch
  const { count: nullCount } = await supabase
    .from('apt_master')
    .select('*', { count: 'exact', head: true })
    .is('household_count', null);
  const { count: tinyCount } = await supabase
    .from('apt_master')
    .select('*', { count: 'exact', head: true })
    .lt('household_count', 50);
  const { count: total } = await supabase
    .from('apt_master')
    .select('*', { count: 'exact', head: true });

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/admin', label: '어드민' },
        { href: '/admin/apt-master', label: '아파트 마스터', bold: true },
      ]} meta="Apt Master" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">아파트 마스터 보정</h1>
          <p className="text-sm text-muted mb-8">
            세대수 NULL·이상치 단지 빠른 편집. 전체 <b>{total ?? 0}</b>개 / NULL <b>{nullCount ?? 0}</b>개 / &lt;50세대 <b>{tinyCount ?? 0}</b>개.
          </p>

          <AptMasterAdmin nullCount={nullCount ?? 0} tinyCount={tinyCount ?? 0} />
        </div>
      </section>
    </Layout>
  );
}
