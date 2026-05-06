import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata = { title: '자산 순위 — 멜른버그' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type Row = {
  rank: number;
  user_id: string;
  display_name: string | null;
  total_wealth: number;
  mlbg_balance: number;
  apt_value: number;
  apt_count: number;
  total_count: number;
};

function fmt(n: number | null | undefined): string {
  return Math.round(Number(n ?? 0)).toLocaleString();
}

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = createPublicClient();
  const { data } = await supabase.rpc('get_wealth_ranking_paged', { p_offset: offset, p_limit: PAGE_SIZE })
    .then((r) => r, () => ({ data: null }));
  const rows = (data ?? []) as Row[];
  const totalCount = rows[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(Number(totalCount) / PAGE_SIZE));

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/ranking', label: '자산 순위', bold: true }]} meta="Ranking" />
      <section className="py-8 sm:py-12">
        <div className="max-w-content mx-auto px-4 sm:px-10">
          <div className="flex items-baseline justify-between gap-4 mb-2 flex-wrap">
            <h1 className="text-[24px] sm:text-[28px] font-bold text-navy tracking-tight">자산 순위</h1>
            <span className="text-[11px] text-muted">총 {Number(totalCount).toLocaleString()}명</span>
          </div>
          <p className="text-sm text-muted mb-6">현금성 mlbg + 보유 부동산 분양가 합계 기준. 1등부터 끝까지 다 표시.</p>

          {rows.length === 0 ? (
            <div className="text-[13px] text-muted text-center py-16 border border-border">데이터가 없어요.</div>
          ) : (
            <>
              {/* 데스크톱 — 테이블 */}
              <div className="hidden md:block">
                <table className="w-full text-[13px] border border-border bg-white">
                  <thead className="bg-bg/40 text-[11px] text-muted uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3 w-[60px]">순위</th>
                      <th className="text-left px-4 py-3">닉네임</th>
                      <th className="text-right px-4 py-3">총자산</th>
                      <th className="text-right px-4 py-3">현금성 (mlbg)</th>
                      <th className="text-right px-4 py-3">부동산 ({rows[0]?.apt_count != null ? '단지수 / 가치' : ''})</th>
                      <th className="text-right px-4 py-3 w-[80px]">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.user_id} className="border-t border-border hover:bg-navy-soft/40">
                        <td className="px-4 py-3 font-bold text-navy tabular-nums">{r.rank}</td>
                        <td className="px-4 py-3 font-semibold text-text truncate max-w-[200px]">{r.display_name ?? '익명'}</td>
                        <td className="px-4 py-3 text-right font-bold text-navy tabular-nums">{fmt(r.total_wealth)}</td>
                        <td className="px-4 py-3 text-right text-text tabular-nums">{fmt(r.mlbg_balance)}</td>
                        <td className="px-4 py-3 text-right text-muted tabular-nums">
                          {r.apt_count > 0 ? <>{r.apt_count}개 / <span className="text-text">{fmt(r.apt_value)}</span></> : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/u/${r.user_id}`} className="text-cyan font-bold no-underline hover:underline text-[12px]">상세보기</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 모바일 — 카드 */}
              <ul className="md:hidden flex flex-col gap-2">
                {rows.map((r) => (
                  <li key={r.user_id}>
                    <Link href={`/u/${r.user_id}`} className="block bg-white border border-border hover:border-navy no-underline px-4 py-3">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[16px] font-bold text-navy tabular-nums w-[40px] flex-shrink-0">{r.rank}</span>
                        <span className="text-[14px] font-bold text-text truncate flex-1 min-w-0">{r.display_name ?? '익명'}</span>
                        <span className="text-[14px] font-bold text-navy tabular-nums flex-shrink-0">{fmt(r.total_wealth)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted pl-[52px]">
                        <span>현금성 <b className="text-text font-semibold tabular-nums">{fmt(r.mlbg_balance)}</b></span>
                        <span>·</span>
                        <span>부동산 <b className="text-text font-semibold tabular-nums">{r.apt_count > 0 ? `${r.apt_count}개 / ${fmt(r.apt_value)}` : '—'}</b></span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
                  {page > 1 && (
                    <Link href={`/ranking?page=${page - 1}`} className="px-3 py-2 text-[12px] border border-border bg-white hover:border-navy hover:text-navy no-underline">← 이전</Link>
                  )}
                  <span className="px-3 py-2 text-[12px] text-muted">{page} / {totalPages}</span>
                  {page < totalPages && (
                    <Link href={`/ranking?page=${page + 1}`} className="px-3 py-2 text-[12px] border border-border bg-white hover:border-navy hover:text-navy no-underline">다음 →</Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
