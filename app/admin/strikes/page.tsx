import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AdminStrikeForm from '@/components/AdminStrikeForm';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: '파업 — 멜른버그 어드민' };
export const dynamic = 'force-dynamic';

type StrikeTarget = {
  asset_type: 'factory' | 'emart';
  asset_id: number;
  asset_name: string;
  brand_label: string;
  occupier_id: string;
  occupier_name: string | null;
  occupier_balance: number;
  default_pct: number;
};

export default async function AdminStrikesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/strikes');
  if (!(await isCurrentUserAdmin())) redirect('/');

  const { data } = await supabase.rpc('list_struck_targets').then((r) => r, () => ({ data: null }));
  const targets = (data ?? []) as StrikeTarget[];

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/admin', label: '어드민' },
        { href: '/admin/strikes', label: '파업', bold: true },
      ]} meta="Strikes" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">💥 파업</h1>
          <p className="text-sm text-muted mb-6">
            점거된 비주거용 자산 (공장 / 시설 / 이마트) 의 점거자 잔액을 % 만큼 차감.
            여러 자산 선택 가능. 적용 시 텔레그램 + 피드 자동 노출.
          </p>

          {targets.length === 0 ? (
            <p className="text-[13px] text-muted py-12 text-center border border-border">
              현재 점거된 비주거용 자산이 없음.
            </p>
          ) : (
            <AdminStrikeForm targets={targets} />
          )}
        </div>
      </section>
    </Layout>
  );
}
