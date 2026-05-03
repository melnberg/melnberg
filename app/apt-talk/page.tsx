import Layout from '@/components/Layout';
import AptMap from '@/components/AptMap';

export const metadata = {
  title: '아파트 토론방 — 멜른버그',
  description: '단지별 토론·평가가 모이는 곳. 지도에서 단지 핀을 눌러 시작합니다.',
};

export const dynamic = 'force-dynamic';

export default function AptTalkPage() {
  return (
    <Layout current="apt-talk">
      <AptMap />
    </Layout>
  );
}
