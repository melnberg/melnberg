'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Product } from '@/lib/products';

type Props = {
  product: Product;
  loggedIn: boolean;
};

type Step = 'gate' | 'pay' | 'submitting' | 'done';

export default function PaymentForm({ product, loggedIn }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<Step>(loggedIn ? 'pay' : 'gate');
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [payerName, setPayerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kakaoReady = product.kakaopay_link && !product.kakaopay_link.startsWith('KAKAOPAY_LINK');
  const naverReady = product.naverpay_link && !product.naverpay_link.startsWith('NAVERPAY_LINK');

  async function startPayment(provider: 'kakaopay' | 'naverpay') {
    if (busy) return;
    const link = provider === 'kakaopay' ? product.kakaopay_link : product.naverpay_link;
    if (!link || link.startsWith('KAKAOPAY_LINK') || link.startsWith('NAVERPAY_LINK')) {
      setError('결제 링크가 아직 준비되지 않았습니다. 오픈채팅으로 문의해주세요.');
      return;
    }

    setBusy(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setStep('gate');
      return;
    }

    const { data, error: insertError } = await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        product_id: product.id,
        product_name: product.name,
        amount: product.price,
        pg_provider: provider,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? '결제 준비에 실패했습니다.');
      setBusy(false);
      return;
    }

    setPaymentId(data.id);
    setStep('submitting');
    setBusy(false);

    // 결제 링크 새 탭으로 열기
    window.open(link, '_blank', 'noopener,noreferrer');
  }

  async function confirmPayment(e: React.FormEvent) {
    e.preventDefault();
    if (busy || paymentId == null) return;
    const trimmed = payerName.trim();
    if (!trimmed) {
      setError('입금자명을 입력해주세요.');
      return;
    }
    setBusy(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('payments')
      .update({ status: 'submitted', payer_name: trimmed })
      .eq('id', paymentId);

    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }

    setStep('done');
    setBusy(false);
    router.refresh();
  }

  async function cancelPending() {
    if (paymentId == null) return;
    if (!confirm('진행 중인 결제 신청을 취소하시겠습니까?')) return;
    await supabase.from('payments').delete().eq('id', paymentId);
    setPaymentId(null);
    setPayerName('');
    setStep('pay');
    setError(null);
  }

  if (step === 'gate') {
    return (
      <div className="border border-border p-6 bg-bg/40">
        <p className="text-[15px] text-text leading-relaxed mb-4 break-keep">
          결제 진행을 위해 로그인이 필요합니다.
          <br />
          <span className="text-muted text-[13px]">결제 내역과 멤버십 상태를 마이페이지에서 확인할 수 있습니다.</span>
        </p>
        <div className="flex gap-2">
          <Link
            href={`/login?next=/${encodeURIComponent(product.filename)}`}
            className="bg-navy text-white px-5 py-3 text-[13px] font-bold tracking-wider uppercase no-underline hover:bg-navy-dark"
          >
            로그인
          </Link>
          <Link
            href={`/signup?next=/${encodeURIComponent(product.filename)}`}
            className="bg-white border border-border text-text px-5 py-3 text-[13px] font-bold tracking-wider uppercase no-underline hover:border-navy hover:text-navy"
          >
            회원가입
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 items-start">
      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Step 01</p>
        <p className="text-xl font-bold text-navy mb-3">결제 수단 선택</p>
        <p className="text-[13px] text-muted mb-5 leading-relaxed">
          카카오페이 또는 네이버페이로 결제해주세요. 결제 창은 새 탭에서 열립니다.
          <br />결제가 끝나면 이 페이지로 돌아와 입금자명을 입력해주세요.
        </p>

        {step === 'pay' && (
          <div className="flex flex-col gap-2.5 max-w-[360px]">
            <button
              type="button"
              onClick={() => startPayment('kakaopay')}
              disabled={busy || !kakaoReady}
              className="flex items-center justify-center bg-kakao text-kakao-text px-5 py-3.5 text-sm font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              카카오페이로 결제
            </button>
            <button
              type="button"
              onClick={() => startPayment('naverpay')}
              disabled={busy || !naverReady}
              className="flex items-center justify-center bg-naver text-white px-5 py-3.5 text-sm font-bold border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              네이버페이로 결제
            </button>
            {(!kakaoReady || !naverReady) && (
              <p className="text-[11px] text-muted leading-relaxed">
                {!kakaoReady && !naverReady
                  ? '결제 링크가 준비 중입니다. 오픈채팅으로 문의해주세요.'
                  : !kakaoReady
                  ? '카카오페이 링크가 준비 중입니다.'
                  : '네이버페이 링크가 준비 중입니다.'}
              </p>
            )}
          </div>
        )}

        {step === 'submitting' && (
          <form onSubmit={confirmPayment} className="flex flex-col gap-4 max-w-[360px]">
            <div className="border border-cyan bg-[#F4FBFE] px-4 py-3 text-[13px] text-navy leading-relaxed">
              결제 창이 열렸습니다.
              <br />
              결제가 완료되면 아래에 <strong>입금자명</strong>을 입력하고 제출해주세요.
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="payer" className="text-[11px] font-bold tracking-widest uppercase text-muted">입금자명</label>
              <input
                id="payer"
                type="text"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="결제 시 표시된 이름"
                required
                className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="bg-navy text-white border-none px-6 py-3.5 text-[13px] font-bold tracking-wider uppercase cursor-pointer hover:bg-navy-dark disabled:opacity-50"
              >
                {busy ? '제출 중...' : '결제 완료 신청'}
              </button>
              <button
                type="button"
                onClick={cancelPending}
                disabled={busy}
                className="bg-white border border-border text-muted px-4 py-3.5 text-[13px] font-semibold tracking-wide cursor-pointer hover:border-navy hover:text-navy disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div className="border border-cyan bg-[#F4FBFE] p-5 max-w-[480px]">
            <p className="text-[11px] font-bold tracking-widest uppercase text-cyan mb-2">결제 신청 완료</p>
            <p className="text-[14px] text-navy leading-relaxed mb-3 break-keep">
              결제 신청이 접수되었습니다.
              <br />입금 확인 후 등급이 자동 부여됩니다. 진행 상황은 마이페이지에서 확인할 수 있습니다.
            </p>
            <Link
              href="/me"
              className="inline-block bg-navy text-white px-5 py-2.5 text-[12px] font-bold tracking-wider uppercase no-underline hover:bg-navy-dark"
            >
              마이페이지로 →
            </Link>
          </div>
        )}

        {error && (
          <p className="text-[12px] text-red-600 mt-3">{error}</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">결제 정보</p>
        <div className="border border-border">
          <div className="bg-navy text-white px-5 py-3.5 text-[11px] font-bold tracking-widest uppercase">{product.name}</div>
          <div className="p-5">
            <div className="text-[32px] font-bold text-navy mb-3 tracking-tight">{product.price_display}</div>
            <p className="text-[11px] text-muted leading-relaxed border-t border-border pt-3">
              취소·환불 문의는 오픈채팅으로 해주세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
