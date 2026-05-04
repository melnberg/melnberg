import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import TossCheckout from '@/components/TossCheckout';
import { products } from '@/lib/products';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: '결제 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const product = products.find((p) => p.id === productId);
  if (!product) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/pay/${productId}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: `/${product.filename}`, label: product.name },
        { href: `/pay/${productId}`, label: '결제', bold: true },
      ]} meta="Pay" />
      <section className="py-12">
        <div className="max-w-[680px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">{product.name}</h1>
          <p className="text-sm text-muted mb-6">결제수단을 선택해주세요.</p>

          <div className="border border-border p-5 mb-6 bg-navy-soft">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-bold text-navy">{product.name}</span>
              <span className="text-[20px] font-bold text-navy tabular-nums">{product.price.toLocaleString('ko-KR')}원</span>
            </div>
            {product.hook && <p className="text-[12px] text-muted mt-2">{product.hook}</p>}
          </div>

          <TossCheckout
            product={{ id: product.id, name: product.name, price: product.price }}
            customer={{
              userId: user.id,
              email: user.email ?? '',
              name: profile?.display_name ?? '',
              phone: profile?.phone ?? '',
            }}
          />
        </div>
      </section>
    </Layout>
  );
}
