import Link from 'next/link';
import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import CafePostUpload from '@/components/CafePostUpload';
import CafePostList, { type CafePostRow } from '@/components/CafePostList';
import { createClient } from '@/lib/supabase/server';
import { isCurrentUserAdmin } from '@/lib/community';

export const metadata = { title: '카페 글 관리 — 멜른버그' };

export const dynamic = 'force-dynamic';

export default async function AdminCafePostsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin/cafe-posts');
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect('/');

  const { data: rawPosts, count: totalCount } = await supabase
    .from('cafe_posts')
    .select('id, title, external_url, posted_at, ingested_at, cafe_post_chunks(count)', { count: 'exact' })
    .order('ingested_at', { ascending: false })
    .limit(200);

  const posts: CafePostRow[] = (rawPosts ?? []).map((p: Record<string, unknown>) => {
    const chunksArr = p.cafe_post_chunks as Array<{ count: number }> | undefined;
    return {
      id: p.id as number,
      title: p.title as string,
      external_url: (p.external_url as string | null) ?? null,
      posted_at: (p.posted_at as string | null) ?? null,
      ingested_at: p.ingested_at as string,
      chunk_count: chunksArr?.[0]?.count ?? 0,
    };
  });

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/admin', label: '어드민' },
        { href: '/admin/cafe-posts', label: '카페 글 관리', bold: true },
      ]} meta="AI Q&A · 데이터 관리" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-baseline justify-between mb-2">
            <h1 className="text-[28px] font-bold text-navy tracking-tight">카페 글 관리</h1>
            <Link href="/admin" className="text-[12px] font-bold text-muted hover:text-navy no-underline">
              ← 어드민
            </Link>
          </div>
          <p className="text-sm text-muted mb-8">
            AI Q&A에 사용할 카페 원본 글을 업로드합니다. 업로드 시 자동으로 의미 단위 청크 분할 + 임베딩 생성.
          </p>

          <section className="mb-12">
            <h2 className="text-[16px] font-bold text-navy mb-3">업로드</h2>
            <CafePostUpload />
          </section>

          <section>
            <h2 className="text-[16px] font-bold text-navy mb-3">
              업로드된 글 (전체 {totalCount ?? posts.length}건{totalCount && totalCount > posts.length ? ` · 최근 ${posts.length}건 표시` : ''})
            </h2>
            <CafePostList posts={posts} />
          </section>
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
