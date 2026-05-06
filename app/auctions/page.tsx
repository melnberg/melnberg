import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';

export const metadata = { title: '시한 경매 — 멜른버그' };

// 2026-05-06: 시한 경매 일시 비활성. 사이트 부하 + 사용 빈도 낮아 잠시 중단.
// 추후 재오픈 시 본 파일 복구 + Sidebar.tsx 메뉴 주석 해제 + Layout 의 비활성 페이지 제거.
export default function AuctionsPage() {
  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/auctions', label: '시한 경매', bold: true }]} meta="Auctions" />
      <section className="py-20">
        <div className="max-w-content mx-auto px-10 text-center">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-4">시한 경매 — 잠시 중단</h1>
          <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">
            안정화 작업으로 시한 경매 기능을 일시 중단했어요.<br />
            진행 중이던 입찰은 자동 정산되었고, 추후 재오픈 시 공지로 안내드립니다.
          </p>
        </div>
      </section>
    </Layout>
  );
}
