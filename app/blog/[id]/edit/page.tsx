import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import PostForm from '@/components/PostForm';
import { getPost, isCurrentUserAdmin } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '블로그 글 수정 — 멜른버그' };

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/blog/${id}/edit`);

  const [post, isAdmin] = await Promise.all([getPost(numId, 'blog'), isCurrentUserAdmin()]);
  if (!post) notFound();
  if (!isAdmin || post.author_id !== user.id) redirect(`/blog/${id}`);

  return (
    <Layout current="blog">
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/blog', label: '블로그' },
          { href: `/blog/${id}`, label: post.title },
          { label: '수정', bold: true },
        ]}
        meta="Edit"
      />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">블로그 글 수정</h1>
          <p className="text-sm text-muted mb-8">내용을 수정하고 저장하세요.</p>
          <PostForm
            initial={{ id: post.id, title: post.title, content: post.content, is_paid_only: post.is_paid_only }}
            category="blog"
            redirectBase="/blog"
          />
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
