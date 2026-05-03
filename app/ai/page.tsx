import Layout from '@/components/Layout';
import AiChat from '@/components/AiChat';

export const metadata = {
  title: 'AI 질문 — 멜른버그',
  description: '멜른버그 카페 글을 근거로 답변하는 AI.',
};

export const dynamic = 'force-dynamic';

export default async function AiPage() {
  return (
    <Layout current="ai">
      <AiChat />
    </Layout>
  );
}
