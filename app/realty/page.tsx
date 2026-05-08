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

// 다크 럭셔리 — 짙은 갈색/와인 + 골드 액센트 (부동산/감정평가소 톤)
const REALTY_BG = 'linear-gradient(180deg, #0f0a07 0%, #1a120e 60%, #1f1812 100%)';

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

      <div style={{ background: REALTY_BG, colorScheme: 'dark' }} className="relative">
        {/* 후광 — 골드/와인 */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-32 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
               style={{ background: 'radial-gradient(circle, #ffd16655, transparent 70%)' }} />
          <div className="absolute top-20 right-0 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl"
               style={{ background: 'radial-gradient(circle, #c9444455, transparent 70%)' }} />
        </div>

        {/* HERO */}
        <section className="relative pt-10 lg:pt-16 pb-6">
          <div className="max-w-content mx-auto px-4 lg:px-10">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-amber-200/80 mb-2">MELNBERG · PROPERTY</div>
                <h1 className="text-[28px] lg:text-[42px] font-black text-white tracking-tight leading-none"
                    style={{ textShadow: '0 0 30px rgba(255,209,102,0.3)' }}>
                  🏢 REALTY <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #ffd166, #c94444)' }}>SQUARE</span>
                </h1>
                <p className="text-[12px] text-white/60 mt-2">실거래·매물·경매·정책 통합 보드. 단지 토론은 메인 지도에서.</p>
              </div>
              {user && (
                <Link
                  href="/realty/new"
                  className="px-5 py-3 text-[13px] font-bold tracking-wider no-underline text-black flex-shrink-0"
                  style={{ background: 'linear-gradient(90deg, #ffd166, #c94444)', boxShadow: '0 4px 24px rgba(255,209,102,0.35)' }}
                >
                  글쓰기 →
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="relative pb-10">
          <div className="max-w-content mx-auto px-4 lg:px-10">
            <RealtyStatsBar stats={stats} />
            <HotAptsSection apts={hotApts} />

            {posts.length === 0 ? (
              <div className="text-center py-20 border border-white/10 bg-white/[0.02]">
                <p className="text-white/60 text-[15px] mb-6">아직 게시된 글이 없습니다.</p>
                {user ? (
                  <Link href="/realty/new" className="inline-block bg-white text-black px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-white/80">
                    첫 글 쓰기 →
                  </Link>
                ) : (
                  <Link href="/login?next=/realty/new" className="inline-block border border-white text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-white hover:text-black">
                    로그인하고 글쓰기
                  </Link>
                )}
              </div>
            ) : (
              <div className="border border-white/10" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="px-4 py-2.5 border-b border-white/10 flex items-baseline gap-2">
                  <h2 className="text-[13px] font-bold text-white tracking-tight">💬 토론</h2>
                  <span className="text-[11px] text-white/40">{posts.length}건</span>
                </div>
                <table className="w-full text-[13px] border-collapse table-fixed">
                  <thead>
                    <tr className="border-b border-white/10 text-white/60">
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
                      <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                        <td className="hidden lg:table-cell py-2.5 px-2 text-center text-white/40 tabular-nums">{p.id}</td>
                        <td className="py-2.5 px-2 lg:px-3 min-w-0 max-w-0">
                          <Link
                            href={`/realty/${p.id}`}
                            className="text-white/90 no-underline hover:text-white flex items-center gap-1 w-full overflow-hidden"
                          >
                            <span className="truncate min-w-0 flex-1">{p.title}</span>
                            {p.comment_count && p.comment_count > 0 ? (
                              <span className="text-amber-300 font-bold shrink-0">[{p.comment_count}]</span>
                            ) : null}
                          </Link>
                          <div className="lg:hidden text-[10px] text-white/40 tabular-nums mt-0.5">{formatBoardTime(p.created_at)}</div>
                        </td>
                        <td className="py-2.5 px-2 text-left font-semibold relative overflow-visible" style={{ color: '#fde68a' }}>
                          <span className="inline-flex max-w-full truncate" style={{ color: '#fde68a' }}>
                            <Nickname info={profileToNicknameInfo(p.author, p.author_id)} />
                          </span>
                        </td>
                        <td className="hidden lg:table-cell py-2.5 px-2 text-center text-white/40 tabular-nums">{formatBoardTime(p.created_at)}</td>
                        <td className="hidden lg:table-cell py-2.5 px-2 text-center text-white/50 tabular-nums">{p.like_count ?? 0}</td>
                        <td className="hidden lg:table-cell py-2.5 px-2 text-center text-white/40 tabular-nums">{p.view_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 px-4 py-3 border border-white/10 text-[12px] leading-relaxed text-white/70" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <b className="text-amber-300">REWARDS</b>
              <span className="text-white/40 mx-2">·</span>
              글 작성 <b className="text-white">+2 mlbg</b>
              <span className="text-white/40 mx-2">/</span>
              댓글 <b className="text-white">+0.5</b>
              <span className="text-white/40 mx-2">/</span>
              게시글 농사 <b className="text-white">+0.5</b>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
