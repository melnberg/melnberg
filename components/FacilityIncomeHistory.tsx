'use client';

import { useEffect, useState } from 'react';

type Row = { paid_for_date: string; amount: number };
type Props = { type: 'emart' | 'factory' | 'restaurant' | 'kids'; id?: number | bigint | null };

// 최근 7일 일별 지급 내역 — 본인이 보유한 시설 패널 안에 노출.
export default function FacilityIncomeHistory({ type, id }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ type });
      if (id != null && type !== 'emart') params.set('id', String(id));
      try {
        const r = await fetch(`/api/facility-income-log?${params.toString()}`, { cache: 'no-store' });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) { setErr(j?.error ?? '실패'); setRows([]); return; }
        setRows((j.rows ?? []) as Row[]);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '실패');
      }
    })();
    return () => { cancelled = true; };
  }, [type, id]);

  if (err) return null;
  if (rows === null) return <div className="text-[11px] text-muted py-2">불러오는 중...</div>;

  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

  return (
    <div className="border border-border bg-bg/30 px-3 py-2.5 mt-3">
      <div className="text-[11px] font-bold tracking-widest uppercase text-muted mb-1.5">📅 최근 7일 지급</div>
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted py-1">아직 지급 내역이 없어요.</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const isToday = r.paid_for_date === todayKst;
            return (
              <li key={r.paid_for_date} className="flex items-center justify-between text-[12px]">
                <span className="text-muted tabular-nums">
                  {r.paid_for_date.slice(5).replace('-', '.')}
                  {isToday && <span className="ml-1 text-cyan font-bold">(오늘)</span>}
                </span>
                <span className="font-bold text-cyan tabular-nums">+{Number(r.amount)} mlbg</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
