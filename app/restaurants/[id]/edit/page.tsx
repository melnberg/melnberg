import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import RestaurantEditForm from '@/components/RestaurantEditForm';
import { RestaurantIcon } from '@/components/CategoryIcons';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function RestaurantEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/restaurants/${numId}/edit`);

  const { data } = await supabase
    .from('restaurant_pins')
    .select('id, name, description, recommended_menu, photo_url, address, dong, author_id')
    .eq('id', numId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) notFound();
  const pin = data as { id: number; name: string; description: string; recommended_menu: string; photo_url: string | null; address: string | null; dong: string | null; author_id: string };
  if (pin.author_id !== user.id) redirect(`/restaurants/${numId}`);

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/restaurants', label: '맛집 추천' },
        { href: `/restaurants/${numId}`, label: pin.name },
        { label: '수정', bold: true },
      ]} meta="Edit" />

      <section className="py-8">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[22px] font-bold text-navy mb-2 inline-flex items-center gap-2"><RestaurantIcon className="w-[20px] h-[20px]" /> 맛집 수정</h1>
          <p className="text-[12px] text-muted mb-6">위치는 수정 불가. 가게명/설명/추천메뉴/사진만 변경 가능.</p>
          <RestaurantEditForm pin={pin} currentUserId={user.id} />
        </div>
      </section>
    </Layout>
  );
}
