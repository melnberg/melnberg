import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import MyStoreDetailClient, { type StoreItem } from '@/components/MyStoreDetailClient';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('my_stores').select('name, description').eq('id', Number(id)).is('deleted_at', null).maybeSingle();
  if (!data) return {};
  const d = data as { name: string; description: string };
  return { title: `${d.name} — 내 가게 — 멜른버그`, description: d.description.slice(0, 140) };
}

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from('my_stores')
    .select('id, author_id, name, category, description, recommended, lat, lng, photo_url, address, dong, contact, url, verified, like_count, author:profiles!author_id(display_name)')
    .eq('id', numId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) notFound();

  const row = data as unknown as StoreItem & { author: { display_name: string | null } | null };
  const store: StoreItem = {
    id: row.id, author_id: row.author_id, name: row.name, category: row.category,
    description: row.description, recommended: row.recommended,
    lat: row.lat, lng: row.lng, photo_url: row.photo_url,
    address: row.address, dong: row.dong, contact: row.contact, url: row.url,
    verified: row.verified, like_count: row.like_count,
    author_name: row.author?.display_name ?? null,
  };

  return (
    <Layout current="stores">
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/stores', label: '내 가게' },
        { label: store.name, bold: true },
      ]} meta="My Store" />
      <article className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <MyStoreDetailClient store={store} />
        </div>
      </article>
    </Layout>
  );
}
