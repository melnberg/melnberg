import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import PostForm from '@/components/PostForm';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '부동산 토론 글쓰기 — 멜른버그' };

export default async function NewRealtyPostPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/realty/new');

  return (
    <Layout current="realty">
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/realty', label: '부동산 토론' },
        { label: '글쓰기', bold: true },
      ]} meta="New Realty Post" />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">🏢 부동산 토론 글쓰기</h1>
          <p className="text-sm text-muted mb-2">부동산 시장·정책·매매 자유 토론.</p>
          <p className="text-[12px] text-muted mb-8 px-3 py-2 bg-cyan/5 border border-cyan/30">
            적립 — <b>+2 mlbg</b> 글, <b>+0.5 mlbg</b> 댓글, 게시글 농사 +0.5 mlbg.
          </p>
          <PostForm category="realty" redirectBase="/realty" />
        </div>
      </section>
    </Layout>
  );
}
