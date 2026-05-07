import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import PostForm from '@/components/PostForm';
import { getPost } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '부동산 토론 글 수정 — 멜른버그' };

export default async function EditRealtyPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/realty/${id}/edit`);

  const post = await getPost(numId, 'realty');
  if (!post) notFound();
  if (post.author_id !== user.id) redirect(`/realty/${id}`);

  return (
    <Layout current="realty">
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/realty', label: '부동산 토론' },
        { href: `/realty/${id}`, label: post.title },
        { label: '수정', bold: true },
      ]} meta="Edit Realty Post" />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">🏢 부동산 토론 글 수정</h1>
          <p className="text-sm text-muted mb-8">내용을 수정하고 저장하세요.</p>
          <PostForm
            initial={{ id: post.id, title: post.title, content: post.content }}
            category="realty"
            redirectBase="/realty"
          />
        </div>
      </section>
    </Layout>
  );
}
