import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '단지 비교 — 멜른버그' };
export const dynamic = 'force-dynamic';

type CompareRow = {
  apt_id: number;
  apt_nm: string;
  dong: string | null;
  lawd_cd: string | null;
  household_count: number | null;
  building_count: number | null;
  kapt_build_year: number | null;
  geocoded_address: string | null;
  listing_price: number;
  recent_median: number | null;
  recent_count: number | null;
  occupier_id: string | null;
};

function fmtKRW(만원: number | null | undefined): string {
  if (만원 == null) return '—';
  if (만원 >= 10000) {
    const 억 = Math.floor(만원 / 10000);
    const 만 = 만원 % 10000;
    return 만 > 0 ? `${억}억 ${만.toLocaleString()}만` : `${억}억`;
  }
  return `${만원.toLocaleString()}만`;
}

// 게임 분양가(mlbg) 와 실거래 중앙값(만원) 비교 — 단지 평가
function valuationLabel(listingPrice: number, recentMedian: number | null): { label: string; color: string } {
  if (recentMedian == null) return { label: '비교 불가', color: 'text-muted' };
  // 1 mlbg = 1억 원 정도로 가정 (느슨한 비교용)
  const realPriceMlbg = recentMedian / 10000; // 만원 → 억 = mlbg 추정
  const ratio = listingPrice / Math.max(realPriceMlbg, 0.001);
  if (ratio < 0.5) return { label: '저평가 — 게임 분양가가 시세보다 낮음', color: 'text-green-600' };
  if (ratio > 2) return { label: '고평가 — 게임 분양가가 시세보다 높음', color: 'text-red-600' };
  return { label: '적정 — 시세와 비슷', color: 'text-navy' };
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const idArr = (ids ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);

  let rows: CompareRow[] = [];
  if (idArr.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase.rpc('get_apts_compare', { p_apt_ids: idArr })
      .then((r) => r, () => ({ data: null }));
    rows = (data ?? []) as CompareRow[];
    // ids 순서 유지
    const byId = new Map(rows.map((r) => [r.apt_id, r]));
    rows = idArr.map((id) => byId.get(id)).filter(Boolean) as CompareRow[];
  }

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/compare', label: '단지 비교', bold: true }]} meta="Compare" />

      <section className="py-12">
        <div className="max-w-content mx-auto px-10">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">단지 비교</h1>
          <p className="text-sm text-muted mb-6">
            URL 에 <code className="text-cyan">?ids=12,34,56</code> 형식으로 단지 ID 를 넣으면 비교 표가 나옵니다.
            홈 지도에서 각 단지 클릭 → URL 의 <code className="text-cyan">?apt=N</code> 값으로 ID 확인 가능.
          </p>

          {rows.length === 0 ? (
            <div className="border border-border bg-white p-8 text-center text-muted">
              비교할 단지가 없습니다. 예: <Link href="/compare?ids=1,2,3" className="text-cyan underline">/compare?ids=1,2,3</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead>
                  <tr className="bg-bg/60 border-y border-navy">
                    <th className="py-3 px-3 font-bold text-left text-navy w-32">항목</th>
                    {rows.map((r) => (
                      <th key={r.apt_id} className="py-3 px-3 font-bold text-left text-navy">
                        <Link href={`/?apt=${r.apt_id}`} className="text-navy hover:underline no-underline">
                          {r.apt_nm}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="동" values={rows.map((r) => r.dong ?? '—')} />
                  <CompareRow label="주소" values={rows.map((r) => r.geocoded_address ?? '—')} />
                  <CompareRow label="세대수" values={rows.map((r) => r.household_count ? `${r.household_count.toLocaleString()}세대` : '—')} />
                  <CompareRow label="동수" values={rows.map((r) => r.building_count ? `${r.building_count}개` : '—')} />
                  <CompareRow label="준공년도" values={rows.map((r) => r.kapt_build_year ? `${r.kapt_build_year}년` : '—')} />
                  <tr className="border-b-2 border-navy/20">
                    <td colSpan={rows.length + 1} className="py-2 px-3 text-[10px] tracking-wider uppercase font-bold text-cyan">시세 비교</td>
                  </tr>
                  <CompareRow label="실거래 중앙값" values={rows.map((r) => fmtKRW(r.recent_median))} sub="(최근 6개월)" />
                  <CompareRow label="실거래 건수" values={rows.map((r) => r.recent_count ? `${r.recent_count}건` : '—')} sub="(최근 6개월)" />
                  <CompareRow label="게임 분양가" values={rows.map((r) => `${r.listing_price.toLocaleString()} mlbg`)} highlight />
                  <tr className="border-b border-border">
                    <td className="py-2.5 px-3 text-[11px] font-bold tracking-widest uppercase text-muted">평가</td>
                    {rows.map((r) => {
                      const v = valuationLabel(r.listing_price, r.recent_median);
                      return (
                        <td key={r.apt_id} className={`py-2.5 px-3 text-[12px] font-bold ${v.color}`}>{v.label}</td>
                      );
                    })}
                  </tr>
                  <CompareRow label="현재 점거" values={rows.map((r) => r.occupier_id ? '점거중' : '빈 단지')} />
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}

function CompareRow({ label, values, sub, highlight }: { label: string; values: string[]; sub?: string; highlight?: boolean }) {
  return (
    <tr className="border-b border-border">
      <td className="py-2.5 px-3 text-[11px] font-bold tracking-widest uppercase text-muted">
        {label}
        {sub && <div className="text-[10px] font-normal text-muted/80 normal-case tracking-normal">{sub}</div>}
      </td>
      {values.map((v, i) => (
        <td key={i} className={`py-2.5 px-3 text-[13px] tabular-nums ${highlight ? 'font-bold text-cyan' : 'text-text'}`}>{v}</td>
      ))}
    </tr>
  );
}
