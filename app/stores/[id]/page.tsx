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
    .select('id, author_id, name, category, description, recommended, lat, lng, photo_url, address, dong, contact, url, verified, like_count')
    .eq('id', numId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) notFound();

  const row = data as StoreItem;
  // 작성자 프로필 별도 fetch (FK 추론 회피)
  const { data: prof } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', row.author_id)
    .maybeSingle();
  const store: StoreItem = {
    ...row,
    author_name: (prof as { display_name?: string | null } | null)?.display_name ?? null,
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
