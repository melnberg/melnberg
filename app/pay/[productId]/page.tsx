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
    <Layout current={product.filename}>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: `/pay/${productId}`, label: product.name, bold: true },
      ]} meta="Pay" />
      <section className="py-12">
        <div className="max-w-[680px] mx-auto px-6">
          {/* 상품 헤드라인 */}
          <h1 className="text-[32px] font-bold text-navy tracking-tight mb-3 leading-tight">{product.name}</h1>
          {product.hook && (
            <p className="text-[18px] font-bold text-navy mb-2 leading-snug">{product.hook}</p>
          )}
          {product.sub_hook && (
            <p className="text-[14px] text-text leading-relaxed mb-8">{product.sub_hook}</p>
          )}

          {/* 가격 박스 */}
          <div className="border border-navy bg-navy-soft px-6 py-5 mb-8 flex items-baseline justify-between">
            <span className="text-[14px] font-bold text-navy tracking-wider uppercase">가격</span>
            <span className="text-[28px] font-bold text-navy tabular-nums">{product.price.toLocaleString('ko-KR')}원</span>
          </div>

          {/* 구성 */}
          {Array.isArray(product.details) && product.details.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[14px] font-bold text-navy tracking-widest uppercase mb-3">구성</h2>
              <ul className="space-y-1.5 text-[14px] text-text">
                {product.details.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-cyan font-bold flex-shrink-0">·</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 진행 절차 */}
          {Array.isArray(product.process) && product.process.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[14px] font-bold text-navy tracking-widest uppercase mb-3">진행 절차</h2>
              <ol className="space-y-1.5 text-[14px] text-text">
                {product.process.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-cyan font-bold flex-shrink-0 tabular-nums">{i + 1}.</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* 결제 위젯 */}
          <div className="mt-10 pt-8 border-t border-border">
            <h2 className="text-[16px] font-bold text-navy mb-2">결제수단 선택</h2>
            <p className="text-[12px] text-muted mb-5">아래에서 결제수단을 고르고 결제를 진행해주세요.</p>
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
        </div>
      </section>
    </Layout>
  );
}
