'use client';

import { useEffect, useRef, useState } from 'react';
import { loadTossPayments, type TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import { createClient } from '@/lib/supabase/client';

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';

type Props = {
  product: { id: string; name: string; price: number };
  customer: { userId: string; email: string; name: string; phone: string };
};

function makeOrderId(productId: string): string {
  // 토스 권장: 영문/숫자/언더바, 6~64자, 멱등키
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `MLBG_${productId}_${ts}_${rnd}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 64);
}

export default function TossCheckout({ product, customer }: Props) {
  const supabase = createClient();
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const paymentMethodRef = useRef<HTMLDivElement>(null);
  const agreementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_KEY) {
      setErr('NEXT_PUBLIC_TOSS_CLIENT_KEY 가 설정되지 않았습니다. 결제담당자에게 문의해주세요.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tossPayments = await loadTossPayments(CLIENT_KEY);
        if (cancelled) return;
        const widgets = tossPayments.widgets({ customerKey: customer.userId });
        if (cancelled) return;
        await widgets.setAmount({ currency: 'KRW', value: product.price });
        if (cancelled) return;
        await Promise.all([
          widgets.renderPaymentMethods({ selector: '#toss-payment-method', variantKey: 'DEFAULT' }),
          widgets.renderAgreement({ selector: '#toss-agreement', variantKey: 'AGREEMENT' }),
        ]);
        if (cancelled) return;
        widgetsRef.current = widgets;
        setReady(true);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      setReady(false);
      widgetsRef.current = null;
      // 토스 SDK는 selector 안에 iframe을 주입함. 재마운트 시 같은 노드에 또 주입되면 실패하므로 비워줌.
      if (paymentMethodRef.current) paymentMethodRef.current.innerHTML = '';
      if (agreementRef.current) agreementRef.current.innerHTML = '';
    };
  }, [customer.userId, product.price]);

  async function pay() {
    if (busy || !ready || !widgetsRef.current) return;
    setBusy(true);
    setErr(null);
    const orderId = makeOrderId(product.id);
    const origin = window.location.origin;

    // 1. 사전 INSERT — pending 상태로 우리 DB에 주문 기록
    const { error: insertErr } = await supabase.from('payments').insert({
      user_id: customer.userId,
      product_id: product.id,
      product_name: product.name,
      amount: product.price,
      pg_provider: 'toss',
      status: 'pending',
      toss_order_id: orderId,
    });
    if (insertErr) {
      setBusy(false);
      setErr(`주문 생성 실패: ${insertErr.message}`);
      return;
    }

    // 2. 토스 결제창 호출 — 성공 시 successUrl 로 redirect
    try {
      await widgetsRef.current.requestPayment({
        orderId,
        orderName: product.name,
        successUrl: `${origin}/pay/success`,
        failUrl: `${origin}/pay/fail`,
        customerEmail: customer.email || undefined,
        customerName: customer.name || undefined,
        customerMobilePhone: customer.phone ? customer.phone.replace(/\D/g, '') : undefined,
      });
    } catch (e) {
      setBusy(false);
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div id="toss-payment-method" ref={paymentMethodRef} />
      <div id="toss-agreement" ref={agreementRef} />
      {err && (
        <div className="text-[12px] px-3 py-2 bg-red-50 text-red-700 border border-red-200 break-all">{err}</div>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={!ready || busy}
        className="w-full bg-navy text-white border-none py-4 text-[14px] font-bold tracking-wider cursor-pointer hover:bg-navy-dark disabled:opacity-50"
      >
        {busy ? '결제창 여는 중...' : ready ? `${product.price.toLocaleString('ko-KR')}원 결제하기` : '준비 중...'}
      </button>
    </div>
  );
}
