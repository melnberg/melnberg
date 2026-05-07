import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { listPosts, formatBoardTime } from '@/lib/community';
import { getCurrentUser } from '@/lib/auth';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';

export const metadata = {
  title: '부동산 토론 — 멜른버그',
  description: '부동산·시장·정책 자유 토론',
};

export const dynamic = 'force-dynamic';

export default async function RealtyPage() {
  const [posts, user] = await Promise.all([listPosts('realty'), getCurrentUser()]);

  return (
    <Layout current="realty">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/realty', label: '부동산 토론', bold: true }]} meta="Realty" />

      <section className="pt-8 lg:pt-14 pb-2">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-cyan">
            <div>
              <h1 className="text-[24px] lg:text-[32px] font-bold text-navy tracking-tight">🏢 부동산 토론</h1>
              <p className="text-[12px] text-muted mt-1">부동산 시장·정책·매매 자유 토론. 보상은 일반 커뮤글과 동일.</p>
            </div>
            {user && (
              <Link
                href="/realty/new"
                className="bg-cyan text-navy px-4 lg:px-5 py-2 lg:py-2.5 text-[12px] lg:text-[13px] font-bold tracking-wider no-underline hover:bg-cyan/80 flex-shrink-0"
              >
                글쓰기 →
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          <div className="mb-4 px-4 py-3 bg-cyan/5 border border-cyan/30 text-[12px] leading-relaxed text-text">
            <b className="text-navy">부동산 토론 부여 규칙</b>
            <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
              <li>글 작성: <b>+2 mlbg</b> · 댓글: <b>+0.5 mlbg</b> · 게시글 농사 +0.5 mlbg</li>
              <li>주제 자유 — 시장·정책·청약·재건축·임대 등</li>
            </ul>
          </div>
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-6">아직 게시된 글이 없습니다.</p>
              {user ? (
                <Link href="/realty/new" className="inline-block bg-cyan text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-cyan/80">
                  첫 글 쓰기 →
                </Link>
              ) : (
                <Link href="/login?next=/realty/new" className="inline-block border-2 border-cyan text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-cyan hover:text-navy">
                  로그인하고 글쓰기
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full text-[13px] border-collapse table-fixed">
              <thead>
                <tr className="bg-cyan/10 border-y border-cyan text-navy">
                  <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-16">번호</th>
                  <th className="py-2.5 px-2 lg:px-3 font-semibold text-left">제목</th>
                  <th className="py-2.5 px-2 font-semibold text-left w-[150px] lg:w-40">작성자</th>
                  <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-24">작성일</th>
                  <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-14">추천</th>
                  <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-14">조회</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b border-border hover:bg-cyan/5 transition-colors">
                    <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">{p.id}</td>
                    <td className="py-2.5 px-2 lg:px-3 min-w-0 max-w-0">
                      <Link
                        href={`/realty/${p.id}`}
                        className="text-text no-underline hover:text-navy hover:underline truncate block w-full"
                      >
                        {p.title}
                        {p.comment_count && p.comment_count > 0 ? (
                          <span className="text-cyan font-bold ml-1">[{p.comment_count}]</span>
                        ) : null}
                      </Link>
                      <div className="lg:hidden text-[10px] text-muted tabular-nums mt-0.5">{formatBoardTime(p.created_at)}</div>
                    </td>
                    <td className="py-2.5 px-2 text-left text-navy font-semibold relative overflow-visible">
                      <span className="inline-flex max-w-full truncate">
                        <Nickname info={profileToNicknameInfo(p.author, p.author_id)} />
                      </span>
                    </td>
                    <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">{formatBoardTime(p.created_at)}</td>
                    <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">{p.like_count ?? 0}</td>
                    <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">{p.view_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </Layout>
  );
}
