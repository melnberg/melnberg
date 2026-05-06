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
  prev_rank: number | null;
  rank_delta: number | null;
};

function fmt(n: number | null | undefined): string {
  return Math.round(Number(n ?? 0)).toLocaleString();
}

// rank_delta 표시 — 한국식 (상승 빨강 ▲ / 하락 파랑 ▼)
// 어제 스냅샷에 없던 신규는 NEW 라벨, 변동 없으면 −
function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[10px] text-muted">NEW</span>;
  if (delta === 0) return <span className="text-[10px] text-muted">−</span>;
  if (delta > 0) return <span className="text-[10px] text-[#dc2626] tabular-nums">▲{delta}</span>;
  return <span className="text-[10px] text-[#0070C0] tabular-nums">▼{Math.abs(delta)}</span>;
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
          <p className="text-sm text-muted mb-6">현금성 mlbg + 보유 부동산 분양가 합계 기준. 매일 아침 7시 갱신, 어제 대비 순위 변동 표시.</p>

          {rows.length === 0 ? (
            <div className="text-[13px] text-muted text-center py-16 border border-border">데이터가 없어요.</div>
          ) : (
            <>
              {/* 데스크톱 — 테이블 (드라이/엑셀 톤, 볼드 X, 패딩 축소) */}
              <div className="hidden md:block">
                <table className="w-full text-[12px] border border-border bg-white">
                  <thead className="bg-bg/40 text-[10px] text-muted uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-1.5 w-[50px]">순위</th>
                      <th className="text-left px-3 py-1.5 w-[60px]">변동</th>
                      <th className="text-left px-3 py-1.5">닉네임</th>
                      <th className="text-right px-3 py-1.5">총자산</th>
                      <th className="text-right px-3 py-1.5">현금성 (mlbg)</th>
                      <th className="text-right px-3 py-1.5">부동산 (단지수 / 가치)</th>
                      <th className="text-right px-3 py-1.5 w-[90px]">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.user_id} className="border-t border-border hover:bg-navy-soft/40">
                        <td className="px-3 py-1 text-text tabular-nums">{r.rank}</td>
                        <td className="px-3 py-1"><DeltaCell delta={r.rank_delta} /></td>
                        <td className="px-3 py-1 text-text truncate max-w-[200px]">{r.display_name ?? '익명'}</td>
                        <td className="px-3 py-1 text-right text-text tabular-nums">{fmt(r.total_wealth)}</td>
                        <td className="px-3 py-1 text-right text-text tabular-nums">{fmt(r.mlbg_balance)}</td>
                        <td className="px-3 py-1 text-right text-text tabular-nums">
                          {r.apt_count > 0 ? `${r.apt_count}개 / ${fmt(r.apt_value)}` : '—'}
                        </td>
                        <td className="px-3 py-1 text-right">
                          <Link href={`/u/${r.user_id}?tab=assets`} className="inline-block px-2 py-0.5 text-[11px] border border-border bg-white text-text no-underline hover:border-navy hover:text-navy">상세보기</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 모바일 — 카드 (드라이 톤, 패딩 축소, 상세보기 버튼 분리) */}
              <ul className="md:hidden flex flex-col">
                {rows.map((r) => (
                  <li key={r.user_id} className="flex items-center gap-2 px-3 py-1.5 bg-white border-b border-border">
                    <span className="text-[12px] text-text tabular-nums w-[28px] flex-shrink-0">{r.rank}</span>
                    <span className="w-[36px] flex-shrink-0"><DeltaCell delta={r.rank_delta} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-text truncate flex-1 min-w-0">{r.display_name ?? '익명'}</span>
                        <span className="text-[13px] text-text tabular-nums flex-shrink-0">{fmt(r.total_wealth)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        <span className="tabular-nums">{fmt(r.mlbg_balance)} mlbg</span>
                        <span>·</span>
                        <span className="tabular-nums">{r.apt_count > 0 ? `${r.apt_count}개 / ${fmt(r.apt_value)}` : '—'}</span>
                      </div>
                    </div>
                    <Link href={`/u/${r.user_id}?tab=assets`} className="flex-shrink-0 px-2 py-0.5 text-[11px] border border-border bg-white text-text no-underline hover:border-navy hover:text-navy">상세</Link>
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
