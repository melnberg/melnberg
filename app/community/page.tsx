import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { listPosts, formatBoardTime } from '@/lib/community';
import { getCurrentUser } from '@/lib/auth';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';

export const metadata = {
  title: '커뮤니티 — 멜른버그',
  description: '멜른버그 회원 커뮤니티',
};

export const dynamic = 'force-dynamic';

export default async function CommunityPage() {
  const [posts, user] = await Promise.all([listPosts(), getCurrentUser()]);

  return (
    <Layout current="community">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/community', label: '커뮤니티', bold: true }]} meta="Community" />

      <section className="pt-8 lg:pt-14 pb-6 border-b border-border">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-navy">
            <h1 className="text-[24px] lg:text-[32px] font-bold text-navy tracking-tight">커뮤니티</h1>
            {user && (
              <Link
                href="/community/new"
                className="bg-navy text-white px-4 lg:px-5 py-2 lg:py-2.5 text-[12px] lg:text-[13px] font-bold tracking-wider no-underline hover:bg-navy-dark"
              >
                글쓰기 →
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-6">아직 게시된 글이 없습니다.</p>
              {user ? (
                <Link href="/community/new" className="inline-block bg-navy text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-navy-dark">
                  첫 글 쓰기 →
                </Link>
              ) : (
                <Link href="/login?next=/community/new" className="inline-block border-2 border-navy text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-navy hover:text-white">
                  로그인하고 글쓰기
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full text-[13px] border-collapse table-fixed">
              <thead>
                <tr className="bg-bg/60 border-y border-navy text-muted">
                  <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-16">번호</th>
                  <th className="py-2.5 px-2 lg:px-3 font-semibold text-left">제목</th>
                  <th className="py-2.5 px-2 font-semibold text-left w-[100px] lg:w-40">작성자</th>
                  <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-24">작성일</th>
                  <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-14">추천</th>
                  <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-14">조회</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => (
                  <tr key={p.id} className="border-b border-border hover:bg-bg/40 transition-colors">
                    <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">{p.id}</td>
                    <td className="py-2.5 px-2 lg:px-3 min-w-0 max-w-0">
                      <Link
                        href={`/community/${p.id}`}
                        className="text-text no-underline hover:text-navy hover:underline truncate block w-full"
                      >
                        {p.title}
                        {p.comment_count && p.comment_count > 0 ? (
                          <span className="text-cyan font-bold ml-1">[{p.comment_count}]</span>
                        ) : null}
                      </Link>
                      {/* 모바일 전용 — 작성일을 제목 아래 작게 노출 */}
                      <div className="lg:hidden text-[10px] text-muted tabular-nums mt-0.5">{formatBoardTime(p.created_at)}</div>
                    </td>
                    <td className="py-2.5 px-2 text-left text-navy font-semibold relative overflow-visible">
                      <span className="inline-flex max-w-full truncate">
                        <Nickname info={profileToNicknameInfo(p.author, p.author_id)} />
                      </span>
                    </td>
                    <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">
                      {formatBoardTime(p.created_at)}
                    </td>
                    <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">
                      {p.like_count ?? 0}
                    </td>
                    <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">
                      {p.view_count ?? 0}
                    </td>
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
