import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import PostForm from '@/components/PostForm';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '글쓰기 — 멜른버그' };

export default async function NewPostPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/community/new');

  return (
    <Layout current="community">
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/community', label: '커뮤니티' },
          { label: '글쓰기', bold: true },
        ]}
        meta="New Post"
      />

      <section className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">글쓰기</h1>
          <p className="text-sm text-muted mb-8">생각을 공유해주세요.</p>
          <PostForm />
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
