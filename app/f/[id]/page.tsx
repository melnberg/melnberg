import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import FactoryDetailClient from './FactoryDetailClient';

export const dynamic = 'force-dynamic';

export default async function FactoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '시설', bold: true }]} meta="Facility" />
      <FactoryDetailClient id={Number.isFinite(numId) ? numId : 0} />
    </Layout>
  );
}
