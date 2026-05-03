import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AptMap from '@/components/AptMap';

export const metadata = {
  title: '아파트 토론방 — 멜른버그',
  description: '단지별 토론·평가가 모이는 곳. 지도에서 단지 핀을 눌러 시작합니다.',
};

export const dynamic = 'force-dynamic';

export default function AptTalkPage() {
  return (
    <Layout current="apt-talk">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/apt-talk', label: '아파트 토론방', bold: true }]} meta="Discussion" />

      <section className="border-b border-border">
        <div className="max-w-content mx-auto px-10 py-6">
          <h1 className="text-[24px] font-bold text-navy tracking-tight">아파트 토론방</h1>
          <p className="text-sm text-muted mt-1">지도에서 단지 핀을 눌러 그 단지의 토론방으로 들어가세요.</p>
        </div>
      </section>

      <AptMap />
    </Layout>
  );
}
