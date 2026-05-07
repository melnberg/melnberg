import { redirect } from 'next/navigation';
import { createClient as createAdminSb } from '@supabase/supabase-js';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AdminPanel from '@/components/AdminPanel';
import LaunchTelegramButton from '@/components/LaunchTelegramButton';
import LaunchPartiesTelegramButton from '@/components/LaunchPartiesTelegramButton';
import AdminAnnouncementForm from '@/components/AdminAnnouncementForm';
import AdminSyncStockButton from '@/components/AdminSyncStockButton';
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
      .select('id, display_name, naver_id, is_admin, tier, tier_expires_at, created_at, link_url')
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // is_solo 별도 fetch (SQL 039 적용 후에만 존재)
  let isSoloMap = new Map<string, boolean>();
  try {
    const { data } = await supabase.from('profiles').select('id, is_solo');
    if (data) for (const r of data as Array<{ id: string; is_solo: boolean | null }>) isSoloMap.set(r.id, !!r.is_solo);
  } catch { /* column 없음 */ }

  // 이메일 (auth.users) — service_role admin API
  const adminSb = createAdminSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const emailMap = new Map<string, string>();
  try {
    // listUsers 페이지네이션 (perPage=1000, 최대 5페이지)
    for (let page = 1; page <= 5; page++) {
      const { data } = await adminSb.auth.admin.listUsers({ page, perPage: 1000 });
      if (!data?.users || data.users.length === 0) break;
      for (const u of data.users) if (u.email) emailMap.set(u.id, u.email);
      if (data.users.length < 1000) break;
    }
  } catch { /* ignore */ }

  const profiles = ((profilesRaw ?? []) as Array<ProfileWithTier & { link_url?: string | null }>).map((p) => ({
    ...p,
    email: emailMap.get(p.id) ?? null,
    is_solo: isSoloMap.get(p.id) ?? false,
  }));
  const payments = (paymentsRaw ?? []) as PaymentRecord[];

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/admin', label: '어드민', bold: true }]} meta="Admin" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
            <h1 className="text-[28px] font-bold text-navy tracking-tight">어드민</h1>
            <div className="flex gap-2 flex-wrap">
              <a href="/admin/ai-logs" className="px-3 py-1.5 border border-border bg-white text-text text-[12px] font-bold no-underline hover:border-navy hover:text-navy">AI 질문 로그</a>
              <a href="/admin/cafe-posts" className="px-3 py-1.5 border border-border bg-white text-text text-[12px] font-bold no-underline hover:border-navy hover:text-navy">카페 글 관리</a>
              <a href="/admin/cafe-members" className="px-3 py-1.5 border border-border bg-white text-text text-[12px] font-bold no-underline hover:border-navy hover:text-navy">카페 유료회원</a>
              <a href="/admin/auctions" className="px-3 py-1.5 border border-[#dc2626] bg-[#dc2626] text-white text-[12px] font-bold no-underline hover:bg-[#b91c1c]">시한 경매</a>
              <a href="/admin/strikes" className="px-3 py-1.5 border border-[#dc2626] bg-[#dc2626] text-white text-[12px] font-bold no-underline hover:bg-[#b91c1c]">💥 파업</a>
              <a href="/admin/apt-master" className="px-3 py-1.5 border border-border bg-white text-text text-[12px] font-bold no-underline hover:border-navy hover:text-navy">아파트 마스터</a>
              <a href="/admin/feedback" className="px-3 py-1.5 border border-border bg-white text-text text-[12px] font-bold no-underline hover:border-navy hover:text-navy">건의사항</a>
              <a href="/admin/basic-income" className="px-3 py-1.5 border border-cyan bg-cyan text-white text-[12px] font-bold no-underline hover:bg-cyan/80">💸 기본소득</a>
              <AdminSyncStockButton />
              <LaunchTelegramButton />
              <LaunchPartiesTelegramButton />
            </div>
          </div>
          <p className="text-sm text-muted mb-8">회원 등급 관리 + 결제 기록.</p>

          <div className="mb-8">
            <AdminAnnouncementForm />
          </div>

          <AdminPanel profiles={profiles} payments={payments} />
        </div>
      </section>

    </Layout>
  );
}
