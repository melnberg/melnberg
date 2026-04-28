import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import PostForm from '@/components/PostForm';
import { isCurrentUserAdmin } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '블로그 글쓰기 — 멜른버그' };

export default async function NewBlogPostPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/blog/new');

  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect('/blog');

  return (
    <Layout current="blog">
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/blog', label: '블로그' },
          { label: '글쓰기', bold: true },
        ]}
        meta="New Post"
      />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">블로그 글쓰기</h1>
          <p className="text-sm text-muted mb-8">관리자만 작성 가능한 공지·콘텐츠.</p>
          <PostForm category="blog" redirectBase="/blog" />
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
