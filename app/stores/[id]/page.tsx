import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import MyStoreDetailClient, { type StoreItem } from '@/components/MyStoreDetailClient';
import { createClient } from '@/lib/supabase/server';
import { createPublicClient } from '@/lib/supabase/public';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const STORE_COLS = 'id, author_id, name, category, description, recommended, lat, lng, photo_url, address, dong, contact, url, verified, like_count';

// cookie 기반 server client → public anon client 순으로 시도 (RLS read 정책은 둘 다 통과해야 정상).
// 등록 직후 cookie/세션 race 또는 PostgREST 캐시 미세 지연 대비 이중 fetch.
async function fetchStore(numId: number): Promise<StoreItem | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('my_stores')
    .select(STORE_COLS)
    .eq('id', numId)
    .is('deleted_at', null)
    .maybeSingle();
  if (data) return data as StoreItem;
  // 폴백 — anon public client 한 번 더.
  const pub = createPublicClient();
  const { data: data2 } = await pub
    .from('my_stores')
    .select(STORE_COLS)
    .eq('id', numId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data2 as StoreItem | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.from('my_stores').select('name, description').eq('id', numId).is('deleted_at', null).maybeSingle();
  if (!data) return {};
  const d = data as { name: string; description: string };
  return { title: `${d.name} — 내 가게 — 멜른버그`, description: d.description.slice(0, 140) };
}

export default async function StoreDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0 || !Number.isInteger(numId)) notFound();

  const row = await fetchStore(numId);
  if (!row) notFound();

  const supabase = await createClient();
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
      <article className="py-12 w-full min-w-0 overflow-x-hidden">
        <div className="max-w-[760px] mx-auto px-6 w-full min-w-0">
          <MyStoreDetailClient store={store} />
        </div>
      </article>
    </Layout>
  );
}
