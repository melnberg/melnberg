import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import BasicIncomeForm from '@/components/BasicIncomeForm';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: '기본소득 지급 — 어드민' };
export const dynamic = 'force-dynamic';

export default async function BasicIncomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/basic-income');
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect('/');

  // 최근 5건 이벤트
  const { data: eventsRaw } = await supabase
    .from('basic_income_events')
    .select('id, paid_at, paid_by, tiers, total_recipients, total_paid, announcement_id')
    .order('paid_at', { ascending: false })
    .limit(5);
  type Event = { id: number; paid_at: string; tiers: unknown; total_recipients: number; total_paid: number; announcement_id: number | null };
  const events = (eventsRaw ?? []) as Event[];

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/admin', label: '어드민' },
        { href: '/admin/basic-income', label: '기본소득', bold: true },
      ]} meta="Admin" />
      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">💸 기본소득 지급</h1>
          <p className="text-sm text-muted mb-8">
            자산 백분위 (하위→상위) 기반 차등 지급. 같은 날 중복 지급 자동 차단.
          </p>

          <BasicIncomeForm />

          {events.length > 0 && (
            <div className="mt-10 border border-border bg-bg/30 px-5 py-4">
              <div className="text-[14px] font-bold text-navy mb-3">최근 지급 내역</div>
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id} className="text-[12px] flex items-center justify-between gap-3 border-b border-[#f0f0f0] last:border-b-0 pb-2 last:pb-0">
                    <span className="text-muted tabular-nums">{new Date(e.paid_at).toLocaleString('ko-KR')}</span>
                    <span className="font-bold text-navy tabular-nums">
                      👥 {e.total_recipients}명 · 💰 {Number(e.total_paid).toLocaleString()} mlbg
                    </span>
                    {e.announcement_id && (
                      <span className="text-[10px] text-cyan">공지 #{e.announcement_id}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
