import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { getStock, listStockPosts } from '@/lib/stocks';
import { getCurrentUser } from '@/lib/auth';
import { formatBoardTime } from '@/lib/community';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const stock = await getStock(code);
  if (!stock) return {};
  return {
    title: `${stock.name} (${stock.code}) — 주식 토론 — 멜른버그`,
    description: `${stock.name} 종목 토론방`,
  };
}

export default async function StockBoardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const stock = await getStock(code);
  if (!stock) notFound();

  const [posts, user] = await Promise.all([listStockPosts(code), getCurrentUser()]);

  return (
    <Layout current="stocks">
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/stocks', label: '주식 토론' },
        { href: `/stocks/${code}`, label: stock.name, bold: true },
      ]} meta={`${stock.market} ${stock.code}`} />

      <section className="pt-8 lg:pt-14 pb-2">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          <div className="flex items-center justify-between gap-4 pb-3 border-b-2 border-cyan flex-wrap">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-[24px] lg:text-[32px] font-bold text-navy tracking-tight">{stock.name}</h1>
                <span className="text-[12px] text-muted tabular-nums">{stock.code}</span>
                <span className="text-[10px] font-bold tracking-widest uppercase bg-cyan/15 text-navy px-1.5 py-0.5">{stock.market}</span>
              </div>
              {stock.latest_close != null ? (() => {
                const pct = stock.latest_change_pct;
                const amt = stock.latest_change_amount;
                const up = pct != null && pct > 0;
                const down = pct != null && pct < 0;
                const color = up ? 'text-[#dc2626]' : down ? 'text-[#2563eb]' : 'text-muted';
                const arrow = up ? '▲' : down ? '▼' : '–';
                return (
                  <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                    <span className="text-[20px] lg:text-[24px] font-bold text-text tabular-nums">
                      {Number(stock.latest_close).toLocaleString()}<span className="text-[12px] text-muted ml-1">원</span>
                    </span>
                    {pct != null && (
                      <span className={`text-[13px] font-bold tabular-nums ${color}`}>
                        {arrow} {amt != null ? Math.abs(amt).toLocaleString() : ''} ({Math.abs(pct).toFixed(2)}%)
                      </span>
                    )}
                    <span className="text-[10px] text-muted tabular-nums">기준 {stock.latest_trade_date}</span>
                  </div>
                );
              })() : (
                <p className="text-[12px] text-muted mt-1">시세 데이터 없음 (cron 미실행 또는 휴장)</p>
              )}
            </div>
            {user ? (
              <Link
                href={`/stocks/${code}/new`}
                className="bg-cyan text-navy px-4 lg:px-5 py-2 lg:py-2.5 text-[12px] lg:text-[13px] font-bold tracking-wider no-underline hover:bg-cyan/80 flex-shrink-0"
              >
                글쓰기 →
              </Link>
            ) : (
              <Link
                href={`/login?next=/stocks/${code}/new`}
                className="border border-cyan text-navy px-4 lg:px-5 py-2 lg:py-2.5 text-[12px] lg:text-[13px] font-bold tracking-wider no-underline hover:bg-cyan/10 flex-shrink-0"
              >
                로그인하고 글쓰기
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-[15px] mb-6">아직 {stock.name} 토론 글이 없습니다.</p>
              {user && (
                <Link href={`/stocks/${code}/new`} className="inline-block bg-cyan text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-cyan/80">
                  첫 글 쓰기 →
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
                        href={`/stocks/${code}/${p.id}`}
                        className="text-text no-underline hover:text-navy hover:underline truncate block w-full"
                      >
                        {p.title}
                        {p.comment_count > 0 ? <span className="text-cyan font-bold ml-1">[{p.comment_count}]</span> : null}
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
