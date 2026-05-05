'use client';

import { useState } from 'react';

export default function EmartTelegramButton() {
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy) return;
    if (!confirm('이마트 분양 시작 알림을 텔레그램에 발송할까요?')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/telegram-emart', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`발송 실패: ${j?.error ?? r.status}`);
      } else {
        alert('텔레그램 발송 완료.');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '발송 실패');
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      className="px-3 py-1.5 border border-[#0088cc] bg-[#0088cc] text-white text-[12px] font-bold no-underline hover:bg-[#0077b5] disabled:opacity-50 cursor-pointer"
    >
      {busy ? '...' : '🛒 이마트 텔레그램 발송'}
    </button>
  );
}
