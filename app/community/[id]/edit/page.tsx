import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import PostForm from '@/components/PostForm';
import { getPost } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '글 수정 — 멜른버그' };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/community/${id}/edit`);

  const post = await getPost(numId);
  if (!post) notFound();
  if (post.author_id !== user.id) redirect(`/community/${id}`);

  return (
    <Layout current="community">
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/community', label: '커뮤니티' },
          { href: `/community/${id}`, label: post.title },
          { label: '수정', bold: true },
        ]}
        meta="Edit"
      />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">글 수정</h1>
          <p className="text-sm text-muted mb-8">내용을 수정하고 저장하세요.</p>
          <PostForm initial={{ id: post.id, title: post.title, content: post.content }} />
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
