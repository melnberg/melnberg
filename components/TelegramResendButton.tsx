'use client';

import { useState } from 'react';
import { notifyTelegram } from '@/lib/telegram-notify';

export default function TelegramResendButton({ auctionId }: { auctionId: number }) {
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy) return;
    if (!confirm('이 경매 시작 알림을 텔레그램에 다시 보낼까요?')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'auction_start', refId: auctionId }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`발송 실패: ${json?.error ?? r.status}`);
      } else {
        alert('텔레그램 발송 완료.');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '발송 실패');
    }
    setBusy(false);
    // 사이드 이펙트 없이 종료
    void notifyTelegram;
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      className="px-2 py-1 text-[10px] font-bold tracking-wide bg-[#0088cc] text-white border border-[#0077b5] hover:bg-[#0077b5] disabled:opacity-50 cursor-pointer"
      title="텔레그램에 시작 알림 다시 보내기"
    >
      {busy ? '...' : '🔔 재발송'}
    </button>
  );
}
