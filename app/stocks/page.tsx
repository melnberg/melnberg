import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { listStocks } from '@/lib/stocks';
import StockSearch from '@/components/StockSearch';

export const metadata = {
  title: '주식 토론 — 멜른버그',
  description: '종목별 주식 토론방',
};

export const dynamic = 'force-dynamic';

export default async function StocksIndexPage() {
  const stocks = await listStocks();

  return (
    <Layout current="stocks">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/stocks', label: '주식 토론', bold: true }]} meta="Stocks" />

      <section className="pt-8 lg:pt-14 pb-2">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          <div className="pb-3 border-b-2 border-cyan">
            <h1 className="text-[24px] lg:text-[32px] font-bold text-navy tracking-tight">📈 주식 토론</h1>
            <p className="text-[12px] text-muted mt-1">종목 클릭 → 해당 종목 토론방. 보상은 일반 커뮤글과 동일.</p>
          </div>
        </div>
      </section>

      <section className="py-6">
        <div className="max-w-content mx-auto px-4 lg:px-10">
          <StockSearch stocks={stocks} />
          <p className="text-[11px] text-muted mt-3">
            관심 종목이 없나요? 어드민에 요청 (커뮤니티 글 또는 건의사항). 시드: KOSPI 25 + KOSDAQ 10.
          </p>
        </div>
      </section>
    </Layout>
  );
}
