import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { listPosts, formatBoardTime } from '@/lib/community';
import { getCurrentUser } from '@/lib/auth';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';

export const metadata = {
  title: '핫딜 — 멜른버그',
  description: '입주민·매매·임대 핫딜 정보 공유',
};

export const dynamic = 'force-dynamic';

export default async function HotdealPage() {
  const [posts, user] = await Promise.all([listPosts('hotdeal'), getCurrentUser()]);

  return (
    <Layout current="hotdeal">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/hotdeal', label: '핫딜', bold: true }]} meta="Hot Deals" />

      <section className="pt-14 pb-4 border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-[#ec4899]">
            <div>
              <h1 className="text-[32px] font-bold text-[#9d174d] tracking-tight">핫딜 🔥</h1>
              <p className="text-[12px] text-[#9d174d]/80 mt-1 font-medium">입주민·매매·임대 핫딜 공유 — 글 작성 시 일반 커뮤글의 <b>2.5배 (5 mlbg base)</b>, 댓글 <b>1 mlbg base</b> 적립.</p>
            </div>
            {user && (
              <Link
                href="/hotdeal/new"
                className="bg-[#ec4899] text-white px-5 py-2.5 text-[13px] font-bold tracking-wider no-underline hover:bg-[#db2777] flex-shrink-0"
              >
                핫딜 올리기 →
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-content mx-auto px-10">
          <div className="mb-4 px-4 py-3 bg-[#fce7f3] border border-[#fbcfe8] text-[12px] leading-relaxed text-[#9d174d]">
            <b>핫딜 게시판 안내</b>
            <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-[#7e1d36]">
              <li>분양·임대·매매 등 가격이 명확한 핫한 정보를 공유하는 곳</li>
              <li>적립 mlbg: 일반 커뮤글의 <b>2.5배 (글 5 / 댓글 1)</b></li>
              <li>AI 평가는 동일 적용 — 한두 줄 짧은 글은 0.1배만, 정성껏 쓴 분석은 최대 1.5배</li>
              <li>의미없는 글로 채굴 시도는 통하지 않음 (한 줄 → 무조건 0.1)</li>
            </ul>
          </div>
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-6">아직 등록된 핫딜이 없습니다.</p>
              {user ? (
                <Link href="/hotdeal/new" className="inline-block bg-[#ec4899] text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-[#db2777]">
                  첫 핫딜 올리기 →
                </Link>
              ) : (
                <Link href="/login?next=/hotdeal/new" className="inline-block border-2 border-[#ec4899] text-[#9d174d] px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-[#ec4899] hover:text-white">
                  로그인하고 올리기
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-[#fce7f3]/40 border-y border-[#ec4899] text-[#9d174d]">
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
                    <tr key={p.id} className="border-b border-border hover:bg-[#fce7f3]/30 transition-colors">
                      <td className="py-2.5 px-2 text-center text-muted tabular-nums">{p.id}</td>
                      <td className="py-2.5 px-3 min-w-0">
                        <Link
                          href={`/hotdeal/${p.id}`}
                          className="text-text no-underline hover:text-[#9d174d] hover:underline truncate inline-block max-w-full align-middle"
                        >
                          {p.title}
                          {p.comment_count && p.comment_count > 0 ? (
                            <span className="text-[#ec4899] font-bold ml-1">[{p.comment_count}]</span>
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
