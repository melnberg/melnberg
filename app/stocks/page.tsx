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

// 라이트 프리미엄 — 흰 바탕 + 미세한 시안/에메랄드 후광
const STOCKS_BG = 'linear-gradient(180deg, #ffffff 0%, #f6f9fc 100%)';

export default async function StocksPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const [postsAll, user, indices] = await Promise.all([
    listPosts('stocks'),
    getCurrentUser(),
    fetchMarketIndices(),
  ]);
  const posts = tag
    ? postsAll.filter((p) => (p as { stock_code?: string | null }).stock_code === tag)
    : postsAll;
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
        {/* 후광 — 미세한 시안/에메랄드 */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full opacity-40 blur-3xl"
               style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.18), transparent 70%)' }} />
          <div className="absolute top-20 right-0 w-[420px] h-[420px] rounded-full opacity-40 blur-3xl"
               style={{ background: 'radial-gradient(circle, rgba(34,224,161,0.14), transparent 70%)' }} />
        </div>

        {/* HERO */}
        <section className="relative pt-10 lg:pt-16 pb-6">
          <div className="max-w-content mx-auto px-4 lg:px-10">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-cyan mb-2">MELNBERG · MARKETS</div>
                <h1 className="text-[28px] lg:text-[42px] font-black text-navy tracking-tight leading-none">
                  📈 STOCK <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(90deg, #00d4ff, #22e0a1)' }}>FLOOR</span>
                </h1>
                <p className="text-[12px] text-muted mt-2">실시간 마켓·인기 종목·전문 토론. 보상 동일.</p>
              </div>
              <Link
                href={user ? '/stocks/new' : '/login?next=/stocks/new'}
                title={user ? undefined : '로그인하면 글 쓸 수 있어요'}
                className="px-5 py-3 text-[13px] font-bold tracking-wider no-underline text-white flex-shrink-0"
                style={{ background: 'linear-gradient(90deg, #00d4ff, #22e0a1)', boxShadow: '0 4px 18px rgba(34,224,161,0.3)' }}
              >
                {user ? '글쓰기 →' : '로그인하고 글쓰기 →'}
              </Link>
            </div>
          </div>
        </section>

        <section className="relative pb-10">
          <div className="max-w-content mx-auto px-4 lg:px-10">
            <MarketTickerBar indices={indices} />
            <HotStocksSection stocks={hot} />

            {posts.length === 0 ? (
              <div className="text-center py-20 border border-border bg-white">
                <p className="text-muted text-[15px] mb-6">아직 게시된 글이 없습니다.</p>
                {user ? (
                  <Link href="/stocks/new" className="inline-block bg-cyan text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-cyan/80">
                    첫 글 쓰기 →
                  </Link>
                ) : (
                  <Link href="/login?next=/stocks/new" className="inline-block border-2 border-cyan text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-cyan hover:text-navy">
                    로그인하고 글쓰기
                  </Link>
                )}
              </div>
            ) : (
              <div className="border border-border bg-white">
                <div className="px-4 py-2.5 border-b border-border flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-[13px] font-bold text-navy tracking-tight">💬 토론</h2>
                  <span className="text-[11px] text-muted">{posts.length}건</span>
                  {filterName && (
                    <span className="ml-auto flex items-center gap-2 text-[11px]">
                      <span className="text-muted">필터:</span>
                      <span className="font-bold text-navy">📈 {filterName}</span>
                      <Link href="/stocks" className="text-muted hover:text-navy no-underline">✕ 해제</Link>
                    </span>
                  )}
                </div>
                <table className="w-full text-[13px] border-collapse table-fixed">
                  <thead>
                    <tr className="bg-cyan/5 border-b border-border text-navy/70">
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
                        <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-bg/40 transition-colors">
                          <td className="hidden lg:table-cell py-2.5 px-2 text-center text-muted tabular-nums">{p.id}</td>
                          <td className="py-2.5 px-2 lg:px-3 min-w-0 max-w-0">
                            <Link
                              href={`/stocks/${p.id}`}
                              className="text-text no-underline hover:text-navy flex items-center gap-1 w-full overflow-hidden"
                            >
                              {tag && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 align-middle shrink-0 bg-cyan/10 text-navy border border-cyan/30">
                                  📈 {tag}
                                </span>
                              )}
                              <span className="truncate min-w-0 flex-1 hover:underline">{p.title}</span>
                              {p.comment_count && p.comment_count > 0 ? (
                                <span className="text-cyan font-bold shrink-0">[{p.comment_count}]</span>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 보상 안내 */}
            <div className="mt-4 px-4 py-3 bg-cyan/5 border border-cyan/30 text-[12px] leading-relaxed text-text">
              <b className="text-navy">REWARDS</b>
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
