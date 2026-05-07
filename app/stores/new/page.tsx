import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import MyStoreForm from '@/components/MyStoreForm';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '내 가게 등록 — 멜른버그' };

export default async function NewStorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/stores/new');

  // 1인 1개 — 이미 있으면 본인 가게로 리다이렉트
  const { data: existing } = await supabase
    .from('my_stores')
    .select('id')
    .eq('author_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) redirect(`/stores/${(existing as { id: number }).id}`);

  return (
    <Layout current="stores">
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/stores', label: '내 가게' },
        { label: '등록', bold: true },
      ]} meta="Register My Store" />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">🏪 내 가게 등록</h1>
          <p className="text-sm text-muted mb-2">실제 운영 중인 사업장만 등록 가능. 1인 1개.</p>
          <p className="text-[12px] text-muted mb-8 px-3 py-2 bg-cyan/5 border border-cyan/30">
            국세청 사업자등록정보 진위확인 통과 시 인증 마크 ✓ 부여 + <b>+30 mlbg</b> 지급.
            입력값(사업자번호·대표자명·개업일)은 검증에만 쓰이고 <b>저장되지 않습니다</b>.
          </p>
          <MyStoreForm currentUserId={user.id} />
        </div>
      </section>
    </Layout>
  );
}
