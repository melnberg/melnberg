import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import PaymentForm from '@/components/PaymentForm';
import { products, getProduct } from '@/lib/products';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const p = getProduct(decodeURIComponent(product));
  if (!p) return {};
  return { title: `${p.name} — 멜른버그`, description: p.meta_desc };
}

export default async function ProductPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  const decoded = decodeURIComponent(product);

  // 상품 페이지가 아닌 다른 라우트는 통과
  const reserved = ['blog', 'terms', 'privacy', 'login', 'signup', 'logo.svg', 'favicon.ico', 'products.json'];
  if (reserved.includes(decoded)) notFound();

  const p = getProduct(decoded);
  if (!p) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;

  return (
    <Layout current={p.filename}>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: `/${p.filename}`, label: p.name, bold: true }]} meta="공식 결제 페이지" />

      {/* 히어로 */}
      <section className="bg-white border-b border-border py-14">
        <div className="max-w-content mx-auto px-10">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-12 items-start">
            <div>
              <p className="text-[11px] font-bold tracking-widest uppercase text-muted mb-3.5">멜른버그 · 결제 페이지</p>
              <h1 className="text-4xl md:text-[44px] font-bold text-navy tracking-tight leading-tight mb-4 break-keep">{p.name}</h1>
              <p className="text-[17px] text-muted leading-relaxed mb-7 break-keep">
                {p.hook}
                <br />
                {p.sub_hook}
              </p>
              <div className="text-[40px] font-bold text-navy tracking-tight">{p.price_display}</div>
            </div>
            <aside className="border border-border p-5 hidden md:block">
              <div className="text-[10px] font-bold tracking-widest uppercase text-muted border-b border-border pb-2.5 mb-3.5">진행 방법</div>
              <ul className="flex flex-col gap-2.5 list-none">
                {p.process.map((step, i) => (
                  <li key={i} className={`text-[13px] flex gap-2.5 items-start text-text ${i === p.process.length - 1 ? '' : 'pb-2.5 border-b border-border'}`}>
                    <span className="text-[18px] font-bold text-cyan leading-none flex-shrink-0 min-w-[22px]">{String(i + 1).padStart(2, '0')}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>

      {/* 포함 내용 */}
      <section className="py-14 border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <SectionHeader title="포함 내용" />
          <ul className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] list-none">
            {p.details.map((d, i) => (
              <li key={i} className="flex items-start gap-3 py-3.5 pr-5 border-b border-border text-[15px] break-keep">
                <Check />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 진행 방법 */}
      <section className="py-14 bg-bg border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <SectionHeader title="진행 방법" />
          <ol className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-6 list-none">
            {p.process.map((step, i) => (
              <li key={i} className="border-t-[3px] border-navy pt-3.5">
                <div className="text-[32px] font-bold text-cyan leading-none mb-2">{String(i + 1).padStart(2, '0')}</div>
                <div className="text-sm leading-relaxed break-keep">{step}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 결제 */}
      <section className="py-14 border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <SectionHeader title="결제" />
          <PaymentForm product={p} loggedIn={loggedIn} />
        </div>
      </section>

      {/* 결제 후 안내 */}
      {p.post_payment_text && (
        <section className="py-14 border-b border-border">
          <div className="max-w-content mx-auto px-10">
            <SectionHeader title="결제 완료 후 안내" />
            <div className="border border-cyan bg-[#FFFEF5]" style={{ background: '#F4FBFE' }}>
              <div className="bg-cyan text-navy px-5 py-3 text-[11px] font-bold tracking-widest uppercase">After Payment</div>
              <div className="p-6">
                <p className="text-[15px] leading-relaxed break-keep">{p.post_payment_text}</p>
                {p.openchat_link && !p.openchat_link.includes('PLACEHOLDER') && (
                  <a href={p.openchat_link} target="_blank" rel="noopener" className="inline-block mt-5 bg-navy text-white px-6 py-3 text-[13px] font-bold no-underline tracking-wide">
                    {p.openchat_label}
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

    </Layout>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-baseline gap-3.5 pb-3 border-b-2 border-navy mb-7">
      <h2 className="text-[22px] font-bold text-navy tracking-tight">{title}</h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function Check() {
  return (
    <span className="flex-shrink-0 w-[18px] h-[18px] bg-cyan mt-0.5 inline-flex items-center justify-center">
      <span className="block" style={{ width: 5, height: 8, border: '1.5px solid #002060', borderTop: 'none', borderLeft: 'none', transform: 'rotate(45deg) translate(-1px, -1px)' }} />
    </span>
  );
}
