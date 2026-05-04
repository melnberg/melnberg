import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';

export const metadata = { title: '결제 실패 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default async function PayFailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const code = (typeof sp.code === 'string' ? sp.code : '') || '';
  const message = (typeof sp.message === 'string' ? sp.message : '') || '결제가 취소되거나 실패했습니다.';

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/pay/fail', label: '결제 실패', bold: true },
      ]} meta="Fail" />
      <section className="py-12">
        <div className="max-w-[520px] mx-auto px-6">
          <div className="border border-red-300 bg-red-50 px-5 py-6">
            <div className="text-[18px] font-bold text-red-700 mb-2">결제 실패</div>
            <div className="text-[13px] text-red-700 leading-relaxed break-keep">{message}</div>
            {code && <div className="text-[11px] text-red-600 mt-2 font-mono">코드: {code}</div>}
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/me" className="inline-block bg-white border border-border text-text px-5 py-2.5 text-[12px] font-bold no-underline hover:border-navy">
              마이페이지
            </Link>
            <Link href="/" className="inline-block bg-navy text-white px-5 py-2.5 text-[12px] font-bold no-underline hover:bg-navy-dark">
              홈으로
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
