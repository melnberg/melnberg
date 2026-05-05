import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { listPosts, formatBoardTime, isCurrentUserAdmin } from '@/lib/community';
import Nickname from '@/components/Nickname';

export const metadata = {
  title: '블로그 — 멜른버그',
  description: '멜른버그 블로그',
};

export const dynamic = 'force-dynamic';

export default async function BlogPage() {
  const [posts, isAdmin] = await Promise.all([listPosts('blog'), isCurrentUserAdmin()]);

  return (
    <Layout current="blog">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/blog', label: '블로그', bold: true }]} meta="Blog" />

      <section className="pt-14 pb-6 border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-navy">
            <h1 className="text-[32px] font-bold text-navy tracking-tight">블로그</h1>
            {isAdmin && (
              <Link
                href="/blog/new"
                className="bg-navy text-white px-5 py-2.5 text-[13px] font-bold tracking-wider no-underline hover:bg-navy-dark"
              >
                글쓰기 →
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-content mx-auto px-10">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-6">아직 게시된 글이 없습니다.</p>
              {isAdmin && (
                <Link href="/blog/new" className="inline-block bg-navy text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-navy-dark">
                  첫 글 쓰기 →
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-bg/60 border-y border-navy text-muted">
                    <th className="py-2.5 px-2 font-semibold text-center w-16">번호</th>
                    <th className="py-2.5 px-3 font-semibold text-left">제목</th>
                    <th className="py-2.5 px-2 font-semibold text-left w-40">작성자</th>
                    <th className="py-2.5 px-2 font-semibold text-center w-24">작성일</th>
                    <th className="py-2.5 px-2 font-semibold text-center w-14">추천</th>
                    <th className="py-2.5 px-2 font-semibold text-center w-14">조회</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="border-b border-border hover:bg-bg/40 transition-colors">
                      <td className="py-2.5 px-2 text-center text-muted tabular-nums">{p.id}</td>
                      <td className="py-2.5 px-3 min-w-0">
                        <Link
                          href={`/blog/${p.id}`}
                          className="text-text no-underline hover:text-navy hover:underline truncate inline-block max-w-full align-middle"
                        >
                          {p.is_paid_only && (
                            <span
                              className="inline-block bg-cyan/15 text-navy text-[11px] font-bold px-1.5 py-0.5 mr-1.5 align-middle tracking-wide"
                              title="조합원 전용 콘텐츠"
                            >
                              조합원
                            </span>
                          )}
                          {p.title}
                          {p.comment_count && p.comment_count > 0 ? (
                            <span className="text-cyan font-bold ml-1">[{p.comment_count}]</span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="py-2.5 px-2 text-center text-navy font-semibold relative overflow-visible">
                        <span className="inline-flex justify-center">
                        <Nickname info={{
                          name: p.author?.display_name ?? null,
                          link: p.author?.link_url ?? null,
                          isPaid: p.author?.tier === 'paid' && (!p.author?.tier_expires_at || new Date(p.author.tier_expires_at).getTime() > Date.now()),
                          isSolo: !!p.author?.is_solo,
                          userId: p.author_id,
                        }} />
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                        {formatBoardTime(p.created_at)}
                      </td>
                      <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                        {p.like_count ?? 0}
                      </td>
                      <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                        {p.view_count ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

    </Layout>
  );
}
