'use client';

import { useState } from 'react';
import type { Product } from '@/lib/products';

export default function PaymentForm({ product }: { product: Product }) {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    const endpoint = product.form_endpoint;
    if (endpoint && !endpoint.startsWith('FORM_ENDPOINT')) {
      try {
        await fetch(endpoint, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, product: product.name, ts: new Date().toISOString() }),
        });
      } catch {}
    }
    setSubmitted(true);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 items-start">
      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Step 01</p>
        <p className="text-xl font-bold text-navy mb-3">정보 입력</p>
        <p className="text-[13px] text-muted mb-5 leading-relaxed">
          이름과 연락처를 입력하고 제출해주세요.
          <br />제출 완료 후 결제 버튼이 활성화됩니다.
        </p>
        {submitted ? (
          <div className="bg-navy text-white px-5 py-4 text-sm font-semibold">정보가 접수됐습니다. 아래에서 결제를 진행해주세요.</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-[11px] font-bold tracking-widest uppercase text-muted">이름</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                required
                className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-[11px] font-bold tracking-widest uppercase text-muted">연락처</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                required
                className="border border-border border-b-2 border-b-navy px-3.5 py-3 text-[15px] outline-none focus:border-b-cyan rounded-none"
              />
            </div>
            <button type="submit" className="bg-navy text-white border-none px-6 py-3.5 text-[13px] font-bold tracking-wider uppercase cursor-pointer self-start hover:bg-navy-dark">
              제출하기 →
            </button>
          </form>
        )}
      </div>

      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Step 02</p>
        <p className="text-xl font-bold text-navy mb-3">결제 수단 선택</p>
        <div className="border border-border">
          <div className="bg-navy text-white px-5 py-3.5 text-[11px] font-bold tracking-widest uppercase">결제 정보</div>
          <div className="p-5">
            <div className="text-[32px] font-bold text-navy mb-5 tracking-tight">{product.price_display}</div>
            <div className={`transition-opacity duration-300 ${submitted ? '' : 'opacity-30 pointer-events-none select-none'}`}>
              <div className="flex flex-col gap-2.5">
                <a href={product.kakaopay_link} target="_blank" rel="noopener" className="flex items-center justify-center bg-kakao text-kakao-text px-5 py-3.5 text-sm font-bold no-underline">카카오페이로 결제</a>
                <a href={product.naverpay_link} target="_blank" rel="noopener" className="flex items-center justify-center bg-naver text-white px-5 py-3.5 text-sm font-bold no-underline">네이버페이로 결제</a>
              </div>
              {!submitted && <p className="text-xs text-muted mt-2.5 text-center">폼 제출 후 활성화됩니다.</p>}
            </div>
            <p className="text-[11px] text-muted mt-3.5 leading-relaxed border-t border-border pt-3">취소·환불 문의는 오픈채팅으로 해주세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
