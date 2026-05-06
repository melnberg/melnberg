import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import RestaurantPinForm from '@/components/RestaurantPinForm';
import { RestaurantIcon } from '@/components/CategoryIcons';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '맛집 추천 등록 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default async function NewRestaurantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/restaurants/new');

  // 본인이 등록한 핀 개수 (5개 제한 안내용)
  const { count } = await supabase
    .from('restaurant_pins')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', user.id)
    .is('deleted_at', null);
  const myCount = count ?? 0;

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/restaurants', label: '맛집 추천' },
        { href: '/restaurants/new', label: '등록', bold: true },
      ]} meta="Restaurant" />

      <section className="py-8">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[24px] font-bold text-navy tracking-tight mb-2 inline-flex items-center gap-2"><RestaurantIcon className="w-[22px] h-[22px]" /> 맛집 추천 등록</h1>
          <p className="text-[12px] text-muted mb-6 leading-relaxed">
            등록 시 <b className="text-navy">+30 mlbg</b> 즉시 지급. 1인 최대 5개 (현재 {myCount}/5).<br />
            등록한 핀에 소유권 X — 누구나 분양받기 가능 (분양가 100, 일 수익 1).
          </p>
          {myCount >= 5 ? (
            <div className="border-2 border-[#dc2626] bg-[#fef2f2] px-5 py-4 text-[13px] text-[#7f1d1d]">
              이미 5개 등록함. 기존 핀 중 하나 삭제 후 등록 가능.
            </div>
          ) : (
            <RestaurantPinForm currentUserId={user.id} />
          )}
        </div>
      </section>
    </Layout>
  );
}
