import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import EmartDetailClient from './EmartDetailClient';

export const dynamic = 'force-dynamic';

export default async function EmartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '이마트', bold: true }]} meta="Facility" />
      <EmartDetailClient id={Number.isFinite(numId) ? numId : 0} />
    </Layout>
  );
}
