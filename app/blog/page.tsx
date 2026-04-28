import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import { listPosts, formatDate } from '@/lib/posts';

export const metadata = {
  title: '블로그 — 멜른버그',
  description: '멜른버그 블로그',
};

export default function BlogPage() {
  const posts = listPosts();
  const [first, ...rest] = posts;

  return (
    <Layout current="blog">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/blog', label: '블로그', bold: true }]} meta="Blog" />

      <section className="pt-14 pb-10 border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-baseline gap-3.5 pb-3 border-b-2 border-navy">
            <h1 className="text-[32px] font-bold text-navy tracking-tight">블로그</h1>
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          {posts.length === 0 ? (
            <p className="text-center py-20 text-muted text-[15px]">아직 게시된 글이 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3">
              {first && (
                <Link href={`/blog/${first.slug}`} className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-10 pb-8 no-underline text-text border-b border-border">
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">{first.tag}</p>
                    <h2 className="text-[28px] font-bold leading-tight mb-3.5 break-keep hover:text-navy hover:underline">{first.title}</h2>
                    {first.excerpt && <p className="text-[15px] text-muted leading-relaxed mb-3 line-clamp-4">{first.excerpt}</p>}
                    <p className="text-[11px] text-muted tracking-wide">{formatDate(first.date)}</p>
                  </div>
                </Link>
              )}
              {rest.map((p, i) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className={`block py-6 pr-6 no-underline text-text border-b border-border ${(i + 1) % 3 === 2 ? 'lg:border-r-0 lg:pr-0' : 'lg:border-r border-border'}`}
                >
                  <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">{p.tag}</p>
                  <h3 className="text-lg font-bold leading-tight mb-2.5 break-keep hover:text-navy hover:underline">{p.title}</h3>
                  {p.excerpt && <p className="text-[13px] text-muted leading-relaxed mb-3.5 line-clamp-3">{p.excerpt}</p>}
                  <p className="text-[11px] text-muted tracking-wide">{formatDate(p.date)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
