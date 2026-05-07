'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSyncAllStocksButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    if (!confirm('전체 KOSPI/KOSDAQ 종목 (~2,400개) 을 KRX 에서 가져와 stocks 테이블에 동기화합니다. 1~2분 걸려요. 진행할까요?')) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/sync-all-stocks', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setMsg(`❌ 실패: ${j?.error ?? r.status}`); }
      else { setMsg(`✅ ${j.total} 종목 (KOSPI ${j.kospi} + KOSDAQ ${j.kosdaq}) 동기화 완료`); router.refresh(); }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '실패');
    }
    setBusy(false);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="bg-white border border-cyan text-navy px-3 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-cyan/10 disabled:opacity-40"
      >
        {busy ? '동기화 중... (~2분)' : '🗂 전체 종목 가져오기'}
      </button>
      {msg && (
        <span className={`text-[11px] ${msg.startsWith('✅') ? 'text-navy' : 'text-red-600'}`}>{msg}</span>
      )}
    </div>
  );
}
