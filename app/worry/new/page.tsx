import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import PostForm from '@/components/PostForm';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '익명 고민상담 글쓰기 — 멜른버그' };

export default async function NewWorryPostPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/worry/new');

  return (
    <Layout current="worry">
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/worry', label: '익명 고민상담' },
        { label: '글쓰기', bold: true },
      ]} meta="New Worry Post" />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">💬 익명 고민상담 글쓰기</h1>
          <p className="text-sm text-muted mb-2">작성자는 <b>익명</b>으로 표시됩니다.</p>
          <p className="text-[12px] text-muted mb-8 px-3 py-2 bg-cyan/5 border border-cyan/30">
            적립 — <b>+2 mlbg</b> 글, <b>+0.5 mlbg</b> 댓글, 게시글 농사 +0.5 mlbg.<br />
            운영자(하멜른·멜른버그) 비방·욕설은 등록이 자동 차단됩니다.
          </p>
          <PostForm category="worry" redirectBase="/worry" />
        </div>
      </section>
    </Layout>
  );
}
