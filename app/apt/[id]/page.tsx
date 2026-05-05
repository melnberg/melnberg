import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import AptDetailClient from './AptDetailClient';

export const dynamic = 'force-dynamic';

export default async function AptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '단지', bold: true }]} meta="Apt" />
      <AptDetailClient id={Number.isFinite(numId) ? numId : 0} />
    </Layout>
  );
}
