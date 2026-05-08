import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { listPosts, formatBoardTime } from '@/lib/community';
import { getCurrentUser } from '@/lib/auth';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import MarketTickerBar from '@/components/MarketTickerBar';
import HotStocksSection from '@/components/HotStocksSection';
import { fetchMarketIndices, fetchHotStocks } from '@/lib/market-snapshot';

export const metadata = {
  title: '주식 토론 — 멜른버그',
  description: '주식·종목 토론방',
};

export const dynamic = 'force-dynamic';

// 다크 프리미엄 테마 — 톤앤매너 무시 (사용자 명시 허락)
const STOCKS_BG = 'linear-gradient(180deg, #050913 0%, #0a1226 60%, #0d1933 100%)';

export default async function StocksPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const [postsAll, user, indices] = await Promise.all([
    listPosts('stocks'),
    getCurrentUser(),
    fetchMarketIndices(),
  ]);
  // ?tag=CODE 있으면 해당 코드 글만 노출
  const posts = tag
    ? postsAll.filter((p) => (p as { stock_code?: string | null }).stock_code === tag)
    : postsAll;
  // 인기 종목 — 최근 14일 전체 글 기준 (필터링 전)
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  const recentPosts = postsAll.filter((p) => new Date(p.created_at).getTime() >= cutoff)
    .map((p) => ({ stock_code: p.stock_code ?? null, stock_name: p.stock_name ?? null }));
  const hot = await fetchHotStocks(recentPosts, 6);
  const filterName = tag
    ? (postsAll.find((p) => (p as { stock_code?: string | null }).stock_code === tag) as { stock_name?: string | null } | undefined)?.stock_name ?? tag
    : null;

  return (
    <Layout current="stocks">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/stocks', label: '주식 토론', bold: true }]} meta="Stocks" />

      <div style={{ background: STOCKS_BG }} className="relative">
        {/* 후광 효과 — 보라/시안 */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-32 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
               style={{ background: 'radial-gradient(circle, #2563eb55, transparent 70%)' }} />
          <div className="absolute top-20 right-0 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl"
               style={{ background: 'radial-gradient(circle, #00d4ff55, transparent 70%)' }} />
        </div>

        {/* HERO */}
        <section className="relative pt-10 lg:pt-16 pb-6">
          <div className="max-w-content mx-auto px-4 lg:px-10">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-cyan-400/80 mb-2">MELNBERG · MARKETS</div>
                <h1 className="text-[28px] lg:text-[42px] font-black text-white tracking-tight leading-none"
                    style={{ textShadow: '0 0 30px rgba(34,224,161,0.25)' }}>
                  📈 STOCK <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #22e0a1, #00d4ff)' }}>FLOOR</span>
                </h1>
                <p className="text-[12px] text-white/60 mt-2">실시간 마켓·인기 종목·전문 토론. 보상 동일.</p>
              </div>
              {user && (
                <Link
                  href="/stocks/new"
                  className="px-5 py-3 text-[13px] font-bold tracking-wider no-underline text-black flex-shrink-0"
                  style={{ background: 'linear-gradient(90deg, #22e0a1, #00d4ff)', boxShadow: '0 4px 24px rgba(34,224,161,0.35)' }}
                >
                  글쓰기 →
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="relative pb-10">
          <div className="max-w-content mx-auto px-4 lg:px-10">
            {/* 마켓 인덱스 */}
            <MarketTickerBar indices={indices} />

            {/* 인기 종목 */}
            <HotStocksSection stocks={hot} />

            {/* 글 목록 — 다크 글래스 테이블 */}
            {posts.length === 0 ? (
              <div className="text-center py-20 border border-white/10 bg-white/[0.02]">
                <p className="text-white/60 text-[15px] mb-6">아직 게시된 글이 없습니다.</p>
                {user ? (
                  <Link href="/stocks/new" className="inline-block bg-white text-black px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-white/80">
                    첫 글 쓰기 →
                  </Link>
                ) : (
                  <Link href="/login?next=/stocks/new" className="inline-block border border-white text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-white hover:text-black">
                    로그인하고 글쓰기
                  </Link>
                )}
              </div>
            ) : (
              <div className="border border-white/10" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="px-4 py-2.5 border-b border-white/10 flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-[13px] font-bold text-white tracking-tight">💬 토론</h2>
                  <span className="text-[11px] text-white/40">{posts.length}건</span>
                  {filterName && (
                    <span className="ml-auto flex items-center gap-2 text-[11px]">
                      <span className="text-white/50">필터:</span>
                      <span className="font-bold text-emerald-300" style={{ color: '#22e0a1' }}>📈 {filterName}</span>
                      <Link href="/stocks" className="text-white/60 hover:text-white no-underline">✕ 해제</Link>
                    </span>
                  )}
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
                    {posts.map((p) => {
                      const pp = p as { stock_code?: string | null; stock_name?: string | null };
                      const tag = pp.stock_name || pp.stock_code;
                      return (
                        <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                          <td className="hidden lg:table-cell py-2.5 px-2 text-center text-white/40 tabular-nums">{p.id}</td>
                          <td className="py-2.5 px-2 lg:px-3 min-w-0 max-w-0">
                            <Link
                              href={`/stocks/${p.id}`}
                              className="text-white/90 no-underline hover:text-white flex items-center gap-1 w-full overflow-hidden"
                            >
                              {tag && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 align-middle text-emerald-300 shrink-0"
                                  style={{ background: 'rgba(34,224,161,0.12)', border: '1px solid rgba(34,224,161,0.3)' }}
                                >
                                  📈 {tag}
                                </span>
                              )}
                              <span className="truncate min-w-0 flex-1">{p.title}</span>
                              {p.comment_count && p.comment_count > 0 ? (
                                <span className="text-cyan-400 font-bold shrink-0">[{p.comment_count}]</span>
                              ) : null}
                            </Link>
                            <div className="lg:hidden text-[10px] text-white/40 tabular-nums mt-0.5">{formatBoardTime(p.created_at)}</div>
                          </td>
                          <td className="py-2.5 px-2 text-left font-semibold relative overflow-visible" style={{ color: '#67e8f9' }}>
                            <span className="inline-flex max-w-full truncate" style={{ color: '#67e8f9' }}>
                              <Nickname info={profileToNicknameInfo(p.author, p.author_id)} />
                            </span>
                          </td>
                          <td className="hidden lg:table-cell py-2.5 px-2 text-center text-white/40 tabular-nums">{formatBoardTime(p.created_at)}</td>
                          <td className="hidden lg:table-cell py-2.5 px-2 text-center text-white/50 tabular-nums">{p.like_count ?? 0}</td>
                          <td className="hidden lg:table-cell py-2.5 px-2 text-center text-white/40 tabular-nums">{p.view_count ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 보상 안내 — 다크 톤 */}
            <div className="mt-4 px-4 py-3 border border-white/10 text-[12px] leading-relaxed text-white/70" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <b className="text-emerald-300">REWARDS</b>
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
