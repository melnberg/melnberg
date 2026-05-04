import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import CompleteSignupForm from '@/components/CompleteSignupForm';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '가입 정보 입력 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default async function CompleteSignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = (typeof sp.next === 'string' ? sp.next : '/') || '/';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/complete-signup?next=' + next)}`);

  const { data: prof } = await supabase
    .from('profiles')
    .select('display_name, naver_id, link_url, phone, profile_completed_at')
    .eq('id', user.id)
    .maybeSingle();

  if (prof?.profile_completed_at) {
    // 이미 완료된 사용자가 잘못 진입 — 그냥 next로 보냄
    redirect(next);
  }

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/complete-signup', label: '가입 정보 입력', bold: true },
      ]} meta="Welcome" />
      <section className="py-12">
        <div className="max-w-[420px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">가입 정보 입력</h1>
          <p className="text-sm text-muted mb-8 leading-relaxed">
            본인확인이 완료되었어요. 멜른버그에서 사용할 닉네임과 카페 정보를 입력해주세요.
          </p>
          <CompleteSignupForm
            initialName={prof?.display_name ?? null}
            initialNaverId={prof?.naver_id ?? null}
            initialLink={prof?.link_url ?? null}
            initialPhone={prof?.phone ?? null}
            next={next}
          />
        </div>
      </section>
    </Layout>
  );
}
