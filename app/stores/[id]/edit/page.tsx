import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import MyStoreForm from '@/components/MyStoreForm';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STORE_COLS = 'id, author_id, name, category, description, recommended, lat, lng, photo_url, address, dong, contact, url';

export default async function StoreEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0 || !Number.isInteger(numId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/stores/${numId}/edit`);

  const { data } = await supabase
    .from('my_stores')
    .select(STORE_COLS)
    .eq('id', numId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) notFound();
  const store = data as {
    id: number; author_id: string;
    name: string; category: string | null; description: string; recommended: string | null;
    lat: number; lng: number; photo_url: string | null;
    address: string | null; dong: string | null;
    contact: string | null; url: string | null;
  };
  if (store.author_id !== user.id) redirect(`/stores/${numId}`);

  return (
    <Layout current="stores">
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/stores', label: '내 가게' },
        { href: `/stores/${numId}`, label: store.name },
        { label: '수정', bold: true },
      ]} meta="Edit My Store" />

      <section className="py-8">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[22px] font-bold text-navy mb-2">🏪 내 가게 수정</h1>
          <p className="text-[12px] text-muted mb-6">위치·정보 변경 가능. 사업자 인증 상태는 유지됨.</p>
          <MyStoreForm currentUserId={user.id} initial={{
            id: store.id,
            name: store.name,
            category: store.category,
            description: store.description,
            recommended: store.recommended,
            lat: store.lat,
            lng: store.lng,
            photo_url: store.photo_url,
            address: store.address,
            dong: store.dong,
            contact: store.contact,
            url: store.url,
          }} />
        </div>
      </section>
    </Layout>
  );
}
