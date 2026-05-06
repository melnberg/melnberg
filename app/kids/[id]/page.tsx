import { notFound } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import KidsDetailClient from '@/components/KidsDetailClient';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';

type Pin = {
  id: number; name: string; description: string; recommended_activity: string;
  lat: number; lng: number; photo_url: string | null; address: string | null;
  dong: string | null;
  occupy_price: number; daily_income: number; like_count: number;
  author_id: string; author_name: string | null;
  occupier_id: string | null; occupier_name: string | null;
  listing_price: number | null; created_at: string;
};

export default async function KidsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = createPublicClient();
  const { data } = await supabase.rpc('list_recent_kids_pins', { p_limit: 100 });
  const pins = (data ?? []) as Pin[];
  const pin = pins.find((p) => p.id === numId);
  if (!pin) notFound();
  const fullName = pin.dong ? `${pin.dong} ${pin.name}` : pin.name;

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/kids', label: '육아 장소' }, { label: fullName, bold: true }]} meta="Kids" />
      <section className="py-8">
        <div className="max-w-[760px] mx-auto px-6">
          <KidsDetailClient pin={pin} />
          <div className="mt-8 text-center">
            <Link href="/kids" className="text-[12px] text-muted no-underline hover:text-navy">← 육아 장소 목록</Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
