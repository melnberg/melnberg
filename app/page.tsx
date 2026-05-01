import Layout from '@/components/Layout';
import Footer from '@/components/Footer';
import AiChat from '@/components/AiChat';

export const metadata = {
  title: '멜른버그 AI 질문하기',
  description: '멜른버그 데이터 안에서 답변을 해 드립니다.',
};

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <Layout current="home">
      <AiChat
        title="멜른버그 AI 질문하기"
        subtitle="멜른버그 데이터 안에서 답변을 해 드립니다."
        centered
      />
      <Footer />
    </Layout>
  );
}
