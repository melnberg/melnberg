import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import PostForm from '@/components/PostForm';
import { getPost } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '주식 토론 글 수정 — 멜른버그' };

export default async function EditStockPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/stocks/${id}/edit`);

  const post = await getPost(numId, 'stocks');
  if (!post) notFound();
  if (post.author_id !== user.id) redirect(`/stocks/${id}`);

  return (
    <Layout current="stocks">
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/stocks', label: '주식 토론' },
        { href: `/stocks/${id}`, label: post.title },
        { label: '수정', bold: true },
      ]} meta="Edit Stock Post" />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">📈 주식 토론 글 수정</h1>
          <p className="text-sm text-muted mb-8">내용을 수정하고 저장하세요.</p>
          <PostForm
            initial={{ id: post.id, title: post.title, content: post.content, stock_code: post.stock_code }}
            category="stocks"
            redirectBase="/stocks"
          />
        </div>
      </section>
    </Layout>
  );
}
