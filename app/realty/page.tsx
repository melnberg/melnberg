import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { listPosts, formatBoardTime } from '@/lib/community';
import { getCurrentUser } from '@/lib/auth';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import RealtyStatsBar from '@/components/RealtyStatsBar';
import HotAptsSection from '@/components/HotAptsSection';
import { fetchRealtyStats, fetchHotApts } from '@/lib/realty-snapshot';

export const metadata = {
  title: '부동산 토론 — 멜른버그',
  description: '부동산·시장·정책 자유 토론',
};

export const dynamic = 'force-dynamic';

const REALTY_BG = 'linear-gradient(180deg, #ffffff 0%, #fbf7ee 100%)';

export default async function RealtyPage() {
  const [posts, user, stats, hotApts] = await Promise.all([
    listPosts('realty'),
    getCurrentUser(),
    fetchRealtyStats(),
    fetchHotApts(6),
  ]);

  return (
    <Layout current="realty">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/realty', label: '부동산 토론', bold: true }]} meta="Realty" />

      <div style={{ background: REALTY_BG }} className="relative">
        {/* 후광 — 골드 + 와인 */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full opacity-50 blur-3xl"
               style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.16), transparent 70%)' }} />
          <div className="absolute top-20 right-0 w-[420px] h-[420px] rounded-full opacity-40 blur-3xl"
               style={{ background: 'radial-gradient(circle, rgba(214,51,108,0.13), transparent 70%)' }} />
        </div>

        {/* HERO */}
        <section className="relative pt-10 lg:pt-16 pb-6">
          <div className="max-w-content mx-auto px-4 lg:px-10">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="text-[11px] font-bold tracking-[0.3em] uppercase mb-2" style={{ color: '#a07f1b' }}>MELNBERG · PROPERTY</div>
                <h1 className="text-[28px] lg:text-[42px] font-black text-navy tracking-tight leading-none">
                  🏢 REALTY <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #c9a227, #d6336c)' }}>SQUARE</span>
                </h1>
                <p className="text-[12px] text-muted mt-2">실거래·매물·경매·정책. 보상 동일.</p>
              </div>
              <Link
                href={user ? '/realty/new' : '/login?next=/realty/new'}
                title={user ? undefined : '로그인하면 글 쓸 수 있어요'}
                className="px-5 py-3 text-[13px] font-bold tracking-wider no-underline text-white flex-shrink-0"
                style={{ background: 'linear-gradient(90deg, #c9a227, #d6336c)', boxShadow: '0 4px 18px rgba(201,162,39,0.32)' }}
              >
                {user ? '글쓰기 →' : '로그인하고 글쓰기 →'}
              </Link>
            </div>
          </div>
        </section>

        <section className="relative pb-10">
          <div className="max-w-content mx-auto px-4 lg:px-10">
            <RealtyStatsBar stats={stats} />
            <HotAptsSection apts={hotApts} />

            {posts.length === 0 ? (
              <div className="text-center py-20 border border-border bg-white">
                <p className="text-muted text-[15px] mb-6">아직 게시된 글이 없습니다.</p>
                {user ? (
                  <Link href="/realty/new" className="inline-block bg-[#c9a227] text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:opacity-90">
                    첫 글 쓰기 →
                  </Link>
                ) : (
                  <Link href="/login?next=/realty/new" className="inline-block border-2 border-[#c9a227] text-[#a07f1b] px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-[#c9a227] hover:text-white">
                    로그인하고 글쓰기
                  </Link>
                )}
              </div>
            ) : (
              <div className="border border-border bg-white">
                <div className="px-4 py-2.5 border-b border-border flex items-baseline gap-2">
                  <h2 className="text-[13px] font-bold text-navy tracking-tight">💬 토론</h2>
                  <span className="text-[11px] text-muted">{posts.length}건</span>
                </div>
                <table className="w-full text-[13px] border-collapse table-fixed">
                  <thead>
                    <tr className="bg-[#fdf7e3] border-b border-border text-navy/70">
                      <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-16 text-[10px] tracking-widest uppercase">#</th>
                      <th className="py-2.5 px-2 lg:px-3 font-semibold text-left text-[10px] tracking-widest uppercase">제목</th>
                      <th className="py-2.5 px-2 font-semibold text-left w-[150px] lg:w-40 text-[10px] tracking-widest uppercase">작성자</th>
                      <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-24 text-[10px] tracking-widest uppercase">작성일</th>
                      <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-14 text-[10px] tracking-widest uppercase">♥</th>
                      <th className="hidden lg:table-cell py-2.5 px-2 font-semibold text-center w-14 text-[10px] tracking-widest uppercase">👁</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-[#fdf7e3] transition-colors">
                        <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">{p.id}</td>
                        <td className="py-2.5 px-2 lg:px-3 min-w-0 max-w-0">
                          <Link
                            href={`/realty/${p.id}`}
                            className="text-text no-underline hover:text-navy flex items-center gap-1 w-full overflow-hidden"
                          >
                            <span className="truncate min-w-0 flex-1 hover:underline">{p.title}</span>
                            {p.comment_count && p.comment_count > 0 ? (
                              <span className="font-bold shrink-0" style={{ color: '#a07f1b' }}>[{p.comment_count}]</span>
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
              </div>
            )}

            <div className="mt-4 px-4 py-3 border border-[#c9a227]/30 text-[12px] leading-relaxed text-text" style={{ background: '#fdf7e3' }}>
              <b style={{ color: '#a07f1b' }}>REWARDS</b>
              <span className="text-muted mx-2">·</span>
              글 작성 <b className="text-navy">+2 mlbg</b>
              <span className="text-muted mx-2">/</span>
              댓글 <b className="text-navy">+0.5</b>
              <span className="text-muted mx-2">/</span>
              게시글 농사 <b className="text-navy">+0.5</b>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
