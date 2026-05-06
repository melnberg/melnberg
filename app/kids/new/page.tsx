import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import KidsPinForm from '@/components/KidsPinForm';
import { KidsIcon } from '@/components/CategoryIcons';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '육아 장소 등록 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default async function NewKidsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/kids/new');

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/kids', label: '육아 장소' }, { href: '/kids/new', label: '등록', bold: true }]} meta="Kids" />
      <section className="py-8">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[24px] font-bold text-navy tracking-tight mb-2 inline-flex items-center gap-2"><KidsIcon className="w-[22px] h-[22px]" /> 육아 장소 등록</h1>
          <p className="text-[12px] text-muted mb-6 leading-relaxed">
            등록 시 <b className="text-navy">+30 mlbg</b> 즉시 지급.<br />
            등록한 핀에 소유권 X — 누구나 분양받기 가능 (분양가 100, 일 수익 1).
          </p>
          <KidsPinForm currentUserId={user.id} />
        </div>
      </section>
    </Layout>
  );
}
