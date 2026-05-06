import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import KidsEditForm from '@/components/KidsEditForm';
import { KidsIcon } from '@/components/CategoryIcons';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function KidsEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/kids/${numId}/edit`);

  const { data } = await supabase.from('kids_pins')
    .select('id, name, description, recommended_activity, photo_url, author_id')
    .eq('id', numId).is('deleted_at', null).maybeSingle();
  if (!data) notFound();
  const pin = data as { id: number; name: string; description: string; recommended_activity: string; photo_url: string | null; author_id: string };
  if (pin.author_id !== user.id) redirect(`/kids/${numId}`);

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/kids', label: '육아 장소' }, { href: `/kids/${numId}`, label: pin.name }, { label: '수정', bold: true }]} meta="Edit" />
      <section className="py-8">
        <div className="max-w-[760px] mx-auto px-6">
          <h1 className="text-[22px] font-bold text-navy mb-2 inline-flex items-center gap-2"><KidsIcon className="w-[20px] h-[20px]" /> 육아 장소 수정</h1>
          <p className="text-[12px] text-muted mb-6">위치는 수정 불가. 장소명/설명/추천 액티비티/사진만 변경 가능.</p>
          <KidsEditForm pin={pin} currentUserId={user.id} />
        </div>
      </section>
    </Layout>
  );
}
