'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSyncStockButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/sync-stock-prices', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(`❌ 실패: ${j?.error ?? r.status}`); }
      else { setMsg(`✅ ${j.total} 종목 중 ${j.updated} 업데이트, ${j.failed} 실패`); router.refresh(); }
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
        className="bg-cyan text-navy px-3 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-cyan/80 disabled:opacity-40 border-none"
      >
        {busy ? '동기화 중... (~30초)' : '📈 주식 시세 지금 동기화'}
      </button>
      {msg && (
        <span className={`text-[11px] ${msg.startsWith('✅') ? 'text-navy' : 'text-red-600'}`}>{msg}</span>
      )}
    </div>
  );
}
