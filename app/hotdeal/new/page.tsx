import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import PostForm from '@/components/PostForm';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '핫딜 올리기 — 멜른버그' };

export default async function NewHotdealPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/hotdeal/new');

  return (
    <Layout current="hotdeal">
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/hotdeal', label: '핫딜' },
          { label: '올리기', bold: true },
        ]}
        meta="New Hot Deal"
      />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-[#9d174d] tracking-tight mb-2">핫딜 올리기 🔥</h1>
          <p className="text-sm text-muted mb-2">입주민·매매·임대 핫딜 정보를 공유해주세요.</p>
          <p className="text-[12px] text-[#9d174d] mb-8 px-3 py-2 bg-[#fce7f3] border border-[#fbcfe8]">
            적립 보상 — 핫딜 글은 일반 커뮤글의 <b>2.5배 (5 mlbg base, AI 평가에 따라 0.5~7.5)</b>. 정성껏 쓰면 더 많이 받음.
          </p>
          <PostForm category="hotdeal" redirectBase="/hotdeal" />
        </div>
      </section>
    </Layout>
  );
}
