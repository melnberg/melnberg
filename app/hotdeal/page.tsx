import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { listPosts, formatBoardTime } from '@/lib/community';
import { getCurrentUser } from '@/lib/auth';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';

export const metadata = {
  title: '핫딜 — 멜른버그',
  description: '쇼핑·먹거리·생활 핫딜 정보 공유',
};

export const dynamic = 'force-dynamic';

export default async function HotdealPage() {
  const [posts, user] = await Promise.all([listPosts('hotdeal'), getCurrentUser()]);

  return (
    <Layout current="hotdeal">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/hotdeal', label: '핫딜', bold: true }]} meta="Hot Deals" />

      <section className="pt-14 pb-4 border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-[#f59e0b]">
            <div>
              <h1 className="text-[32px] font-bold text-[#92400e] tracking-tight">핫딜</h1>
              <p className="text-[12px] text-[#92400e]/80 mt-1 font-medium">만두·쇼핑·먹거리·생활용품 등 핫한 거래 정보 공유 — 일반 커뮤글의 <b>2.5배 (글 5 / 댓글 1 mlbg)</b> 적립.</p>
            </div>
            {user && (
              <Link
                href="/hotdeal/new"
                className="bg-[#f59e0b] text-white px-5 py-2.5 text-[13px] font-bold tracking-wider no-underline hover:bg-[#d97706] flex-shrink-0"
              >
                핫딜 올리기 →
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-content mx-auto px-10">
          <div className="mb-4 px-4 py-3 bg-[#fef3c7] border border-[#fde68a] text-[12px] leading-relaxed text-[#78350f]">
            <b>핫딜 게시판 안내</b>
            <ul className="mt-1.5 space-y-0.5 list-disc list-inside">
              <li>만두·쇼핑·먹거리·생활용품 등 회원 간 알면 좋은 핫한 정보 공유</li>
              <li>적립 mlbg: 일반 커뮤글의 <b>2.5배 (글 5 / 댓글 1)</b></li>
              <li>AI 평가는 동일 — 정성껏 쓴 분석은 최대 1.5배, 한두 줄 짧은 글은 0.1배</li>
            </ul>
          </div>
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-6">아직 등록된 핫딜이 없습니다.</p>
              {user ? (
                <Link href="/hotdeal/new" className="inline-block bg-[#f59e0b] text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-[#d97706]">
                  첫 핫딜 올리기 →
                </Link>
              ) : (
                <Link href="/login?next=/hotdeal/new" className="inline-block border-2 border-[#f59e0b] text-[#92400e] px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-[#f59e0b] hover:text-white">
                  로그인하고 올리기
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-[#fef3c7]/40 border-y border-[#f59e0b] text-[#92400e]">
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
                    <tr key={p.id} className="border-b border-border hover:bg-[#fef3c7]/30 transition-colors">
                      <td className="py-2.5 px-2 text-center text-muted tabular-nums">{p.id}</td>
                      <td className="py-2.5 px-3 min-w-0">
                        <Link
                          href={`/hotdeal/${p.id}`}
                          className="text-text no-underline hover:text-[#92400e] hover:underline truncate inline-block max-w-full align-middle"
                        >
                          {p.title}
                          {p.comment_count && p.comment_count > 0 ? (
                            <span className="text-[#f59e0b] font-bold ml-1">[{p.comment_count}]</span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="py-2.5 px-2 text-left text-navy font-semibold relative overflow-visible">
                        <span className="inline-flex">
                          <Nickname info={profileToNicknameInfo(p.author, p.author_id)} />
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
