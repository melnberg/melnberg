import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import { listPosts, getPost, formatDate } from '@/lib/posts';

export function generateStaticParams() {
  return listPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return { title: `${post.title} — 멜른버그`, description: post.excerpt };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <Layout current="blog">
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/blog', label: '블로그' },
          { label: post.title, bold: true },
        ]}
        meta="Blog Post"
      />

      <article>
        <div className="pt-14 pb-8 border-b border-border">
          <div className="max-w-content mx-auto px-10">
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-3">{post.tag}</p>
            <h1 className="text-[40px] font-bold text-navy tracking-tight leading-tight mb-4 break-keep">{post.title}</h1>
            <p className="text-xs text-muted tracking-wide">{formatDate(post.date)}</p>
          </div>
        </div>
        <div className="max-w-content mx-auto px-10">
          <div className="max-w-[680px] py-12 pb-20">
            <div
              className="prose-content text-[17px] leading-loose"
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            />
            <Link href="/blog" className="inline-block text-xs font-bold text-navy no-underline tracking-wide border-b border-navy mt-6">
              ← 블로그로 돌아가기
            </Link>
          </div>
        </div>
      </article>

      <Footer />
    </Layout>
  );
}
