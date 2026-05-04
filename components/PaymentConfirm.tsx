'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Result = { ok: true; method?: string | null; amount?: number; productName?: string | null }
  | { ok: false; error: string };

export default function PaymentConfirm({ paymentKey, orderId, amount }: { paymentKey: string; orderId: string; amount: number }) {
  const [state, setState] = useState<'loading' | 'done'>('loading');
  const [result, setResult] = useState<Result | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (!paymentKey || !orderId || !amount) {
      setResult({ ok: false, error: '결제 정보 누락 (paymentKey/orderId/amount).' });
      setState('done');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });
        const data = await res.json();
        if (!res.ok) {
          setResult({ ok: false, error: data?.error ?? `오류: ${res.status}` });
        } else {
          setResult({ ok: true, method: data.method ?? null, amount: data.amount, productName: data.productName ?? null });
        }
      } catch (e) {
        setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      } finally {
        setState('done');
      }
    })();
  }, [paymentKey, orderId, amount]);

  if (state === 'loading') {
    return <div className="text-center py-8 text-[13px] text-muted">검증 중...</div>;
  }

  if (result?.ok) {
    return (
      <div className="border border-cyan bg-cyan/10 px-5 py-6 text-center">
        <div className="text-[18px] font-bold text-navy mb-2">결제 완료</div>
        <div className="text-[14px] text-text">{result.productName ?? '결제'} · <b className="tabular-nums">{(result.amount ?? 0).toLocaleString('ko-KR')}원</b></div>
        {result.method && <div className="text-[11px] text-muted mt-1">{result.method}</div>}
        <div className="mt-5">
          <Link href="/me" className="inline-block bg-navy text-white px-5 py-2.5 text-[12px] font-bold no-underline hover:bg-navy-dark">
            마이페이지에서 확인 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-red-300 bg-red-50 px-5 py-6 text-center">
      <div className="text-[16px] font-bold text-red-700 mb-2">결제 검증 실패</div>
      <div className="text-[12px] text-red-700 break-all">{result?.error ?? '알 수 없는 오류'}</div>
      <div className="mt-5">
        <Link href="/me" className="inline-block bg-navy text-white px-5 py-2.5 text-[12px] font-bold no-underline hover:bg-navy-dark">
          마이페이지로
        </Link>
      </div>
    </div>
  );
}
