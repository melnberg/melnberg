import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';

export const dynamic = 'force-dynamic';

// 2026-05-06: 시한 경매 일시 비활성. 추후 재오픈 시 본 파일 git history 에서 복구.
export default async function AuctionDetailPage() {
  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/auctions', label: '시한 경매', bold: true }]} meta="Auctions" />
      <section className="py-20">
        <div className="max-w-content mx-auto px-10 text-center">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-4">시한 경매 — 잠시 중단</h1>
          <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">
            안정화 작업으로 시한 경매 기능을 일시 중단했어요.<br />
            진행 중이던 입찰은 자동 정산되었습니다.
          </p>
        </div>
      </section>
    </Layout>
  );
}
