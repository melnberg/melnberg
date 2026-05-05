'use client';

import { useState } from 'react';

export default function LaunchTelegramButton() {
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy) return;
    if (!confirm('이마트·하이닉스·삼성·코스트코·금속노조·화물연대 6건 텔레그램 발송. (분양 당일 + 다음날 2번 사용 권장)')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/telegram-launch', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`발송 실패: ${j?.error ?? r.status}`);
      } else if (j.failed > 0) {
        alert(`일부 실패 — 성공 ${j.sent}건, 실패 ${j.failed}건\n${(j.errors ?? []).join('\n')}`);
      } else {
        alert(`텔레그램 ${j.sent}건 발송 완료.`);
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
      title="6건 분양 시작 텔레그램 일괄 발송 (분양 당일 + 다음날 2회 권장)"
    >
      {busy ? '...' : '📢 분양 시작 텔레그램 발송'}
    </button>
  );
}
