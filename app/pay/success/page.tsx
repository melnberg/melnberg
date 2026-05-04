import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import PaymentConfirm from '@/components/PaymentConfirm';

export const metadata = { title: '결제 완료 — 멜른버그' };
export const dynamic = 'force-dynamic';

export default async function PaySuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const paymentKey = (typeof sp.paymentKey === 'string' ? sp.paymentKey : '') || '';
  const orderId = (typeof sp.orderId === 'string' ? sp.orderId : '') || '';
  const amount = (typeof sp.amount === 'string' ? sp.amount : '') || '';

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/pay/success', label: '결제 완료', bold: true },
      ]} meta="Success" />
      <section className="py-12">
        <div className="max-w-[520px] mx-auto px-6">
          <h1 className="text-[26px] font-bold text-navy tracking-tight mb-2">결제 처리 중</h1>
          <p className="text-sm text-muted mb-8">잠시만 기다려주세요. 토스 결제 검증 중입니다.</p>
          <PaymentConfirm paymentKey={paymentKey} orderId={orderId} amount={Number(amount) || 0} />
          <p className="text-[11px] text-muted text-center mt-8">
            <Link href="/me" className="text-navy hover:underline no-underline">마이페이지로</Link>
          </p>
        </div>
      </section>
    </Layout>
  );
}
