import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import { products } from '@/lib/products';

export const metadata = {
  title: '멜른버그',
  description: '멜른버그 — 상담과 멤버십',
};

export default function Home() {
  return (
    <Layout current="home">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/', label: '홈', bold: true }]} meta="공식 페이지" />

      <section className="py-16 border-b border-border text-center">
        <div className="max-w-content mx-auto px-10">
          <p className="text-[11px] font-bold tracking-widest uppercase text-muted mb-4">멜른버그</p>
          <h1 className="text-4xl md:text-5xl font-bold text-navy tracking-tight leading-tight mb-5">생각을 정리하는 시간.</h1>
          <p className="text-[17px] text-muted max-w-[520px] mx-auto mb-8 leading-relaxed">
            상담과 멤버십으로 구성된 멜른버그.
            <br />
            필요한 것만, 필요할 때.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/짧은상담" className="bg-navy text-white px-7 py-3.5 text-sm font-bold tracking-wide no-underline hover:bg-navy-dark">짧은상담 신청</Link>
            <Link href="/신규가입" className="bg-transparent text-navy border-2 border-navy px-7 py-3.5 text-sm font-bold tracking-wide no-underline hover:bg-navy hover:text-white">멤버십 가입</Link>
          </div>
        </div>
      </section>

      <section className="py-14 border-b border-border">
        <div className="max-w-content mx-auto px-10">
          <div className="flex items-baseline gap-4 pb-3 border-b-2 border-navy mb-8">
            <h2 className="text-[22px] font-bold text-navy tracking-tight">상품</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            {products.map((p, i) => (
              <Link
                key={p.id}
                href={`/${p.filename}`}
                className={`block py-6 no-underline text-text border-b border-border ${i % 2 === 0 ? 'md:pr-7 md:border-r' : 'md:pl-7'}`}
              >
                <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">
                  {p.id.includes('membership') || p.id === 'renewal' ? '멤버십' : '상담'}
                </p>
                <p className="text-xl font-bold mb-2 leading-tight hover:text-navy hover:underline">{p.name}</p>
                <p className="text-[22px] font-bold text-navy mb-2.5">{p.price_display}</p>
                <p className="text-[13px] text-muted leading-relaxed mb-4">{p.hook}</p>
                <span className="text-xs font-bold text-navy tracking-wide border-b border-navy">신청하기 →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </Layout>
  );
}
