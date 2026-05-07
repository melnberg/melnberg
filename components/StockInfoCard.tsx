'use client';

import { useEffect, useState } from 'react';

export type StockInfo = {
  code: string;
  name: string;
  price: number | null;
  lastClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: string | null;
  marketCap: string | null;
  foreignRate: string | null;
  per: string | null;
  eps: string | null;
  pbr: string | null;
  dividendYield: string | null;
  high52: number | null;
  low52: number | null;
  history: Array<{ date: string; close: number; change: number; direction: string | null; volume: number }>;
};

// 작은 SVG 라인차트 (sparkline) — 종가 추이.
function Sparkline({ data }: { data: Array<{ close: number }> }) {
  if (data.length < 2) return null;
  const w = 280, h = 60, pad = 2;
  const closes = data.map((d) => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const step = (w - pad * 2) / (closes.length - 1);
  const points = closes.map((c, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (c - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = closes[closes.length - 1];
  const first = closes[0];
  const up = last > first;
  const color = up ? '#dc2626' : last < first ? '#2563eb' : '#6b7280';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function StockInfoCard({ code, compact = false }: { code: string; compact?: boolean }) {
  const [info, setInfo] = useState<StockInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setErr(null);
    (async () => {
      try {
        const r = await fetch(`/api/stock/info?code=${code}`, { cache: 'no-store' });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !j?.ok) { setErr(j?.error ?? '시세 가져오기 실패'); return; }
        setInfo(j as StockInfo);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '실패');
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (err) return <div className="border border-red-200 bg-red-50 text-red-700 text-[12px] px-3 py-2">시세 정보 가져오기 실패: {err}</div>;
  if (!info) return <div className="border border-border bg-bg/30 px-3 py-3 text-[12px] text-muted">시세 불러오는 중...</div>;

  const change = info.price != null && info.lastClose != null ? info.price - info.lastClose : null;
  const pct = change != null && info.lastClose ? (change / info.lastClose * 100) : null;
  const up = pct != null && pct > 0;
  const down = pct != null && pct < 0;
  const color = up ? 'text-[#dc2626]' : down ? 'text-[#2563eb]' : 'text-muted';
  const arrow = up ? '▲' : down ? '▼' : '–';

  return (
    <div className="border border-cyan/40 bg-cyan/5 px-4 py-3">
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold text-navy">📈 {info.name}</span>
          <span className="text-[11px] text-muted tabular-nums">{info.code}</span>
        </div>
        {info.price != null && (
          <div className="flex items-baseline gap-2">
            <span className="text-[18px] font-bold text-text tabular-nums">{info.price.toLocaleString()}</span>
            {pct != null && (
              <span className={`text-[12px] font-bold tabular-nums ${color}`}>
                {arrow} {Math.abs(change ?? 0).toLocaleString()} ({Math.abs(pct).toFixed(2)}%)
              </span>
            )}
          </div>
        )}
      </div>

      {/* 차트 */}
      {info.history.length > 1 && <div className="mb-2"><Sparkline data={info.history} /></div>}

      {/* 기본 정보 (compact 모드면 핵심만) */}
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'} gap-x-3 gap-y-1 text-[11px]`}>
        {info.marketCap && <div className="flex justify-between"><span className="text-muted">시총</span><span className="font-semibold tabular-nums">{info.marketCap}</span></div>}
        {info.volume && <div className="flex justify-between"><span className="text-muted">거래량</span><span className="font-semibold tabular-nums">{info.volume}</span></div>}
        {info.per && <div className="flex justify-between"><span className="text-muted">PER</span><span className="font-semibold tabular-nums">{info.per}</span></div>}
        {info.pbr && <div className="flex justify-between"><span className="text-muted">PBR</span><span className="font-semibold tabular-nums">{info.pbr}</span></div>}
        {!compact && (
          <>
            {info.high52 != null && <div className="flex justify-between"><span className="text-muted">52주 최고</span><span className="font-semibold tabular-nums">{info.high52.toLocaleString()}</span></div>}
            {info.low52 != null && <div className="flex justify-between"><span className="text-muted">52주 최저</span><span className="font-semibold tabular-nums">{info.low52.toLocaleString()}</span></div>}
            {info.foreignRate && <div className="flex justify-between"><span className="text-muted">외인비중</span><span className="font-semibold tabular-nums">{info.foreignRate}</span></div>}
            {info.dividendYield && <div className="flex justify-between"><span className="text-muted">배당수익률</span><span className="font-semibold tabular-nums">{info.dividendYield}</span></div>}
          </>
        )}
      </div>
    </div>
  );
}
