// 인기 종목 — 최근 14일 stocks 카테고리 글에서 가장 많이 언급된 종목 카드 그리드.
import Link from 'next/link';
import type { HotStock } from '@/lib/market-snapshot';

function fmtPrice(n: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString();
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 200, h = 50, pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  const points = data.map((c, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (c - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function HotStocksSection({ stocks }: { stocks: HotStock[] }) {
  if (stocks.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-2.5">
        <h2 className="text-[14px] font-bold text-navy tracking-tight">🔥 인기 종목</h2>
        <span className="text-[11px] text-muted">최근 14일 토론 많은 순</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {stocks.map((s) => {
          const up = s.changePct != null && s.changePct > 0;
          const down = s.changePct != null && s.changePct < 0;
          const color = up ? '#dc2626' : down ? '#2563eb' : '#6b7280';
          const arrow = up ? '▲' : down ? '▼' : '–';
          return (
            <Link
              key={s.code}
              href={`/stocks?tag=${encodeURIComponent(s.code)}`}
              className="border border-border bg-white px-3 py-2.5 hover:border-cyan transition-colors no-underline block"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[13px] font-bold text-navy truncate">{s.name}</span>
                  <span className="text-[10px] text-muted tabular-nums shrink-0">{s.code}</span>
                </div>
                <span className="text-[10px] font-bold bg-cyan/15 text-navy px-1.5 py-0.5 shrink-0">
                  {s.postCount}건
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[15px] font-bold tabular-nums text-text leading-tight">
                    {s.price != null ? fmtPrice(s.price, s.currency) : '—'}
                  </span>
                  {s.changePct != null && (
                    <span className="text-[11px] font-bold tabular-nums leading-tight" style={{ color }}>
                      {arrow} {Math.abs(s.changePct).toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="w-[110px] h-[40px] shrink-0">
                  <Sparkline data={s.history} color={color} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
