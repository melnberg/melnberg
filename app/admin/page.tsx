import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import AdminPanel from '@/components/AdminPanel';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';
import { type ProfileWithTier, type PaymentRecord } from '@/lib/tier';

export const metadata = { title: '어드민 — 멜른버그' };

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect('/');

  const [{ data: profilesRaw }, { data: paymentsRaw }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, is_admin, tier, tier_expires_at, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // 이메일 가져오기는 어드민 권한 필요해서 — 사용자 ID만 노출
  const profiles = (profilesRaw ?? []) as ProfileWithTier[];
  const payments = (paymentsRaw ?? []) as PaymentRecord[];

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/admin', label: '어드민', bold: true }]} meta="Admin" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-baseline justify-between mb-2">
            <h1 className="text-[28px] font-bold text-navy tracking-tight">어드민</h1>
            <a
              href="/admin/cafe-posts"
              className="text-[12px] font-bold text-navy hover:text-cyan no-underline tracking-wider uppercase"
            >
              카페 글 관리 →
            </a>
          </div>
          <p className="text-sm text-muted mb-8">회원 등급 관리 + 결제 기록.</p>

          <AdminPanel profiles={profiles} payments={payments} />
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
