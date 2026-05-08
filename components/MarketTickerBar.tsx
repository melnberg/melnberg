// 주식 게시판 헤더 — 마켓 인덱스 4종 (코스피·코스닥·SPY·BTC). 서버 컴포넌트.
import type { MarketIndex } from '@/lib/market-snapshot';

function fmtPrice(n: number, currency: 'KRW' | 'USD' | 'CRYPTO'): string {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'CRYPTO') return n.toLocaleString();
  return n.toLocaleString();
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 120, h = 32, pad = 1;
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
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function MarketTickerBar({ indices }: { indices: MarketIndex[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
      {indices.map((idx) => {
        const up = idx.changePct != null && idx.changePct > 0;
        const down = idx.changePct != null && idx.changePct < 0;
        const color = up ? '#dc2626' : down ? '#2563eb' : '#6b7280';
        const arrow = up ? '▲' : down ? '▼' : '–';
        return (
          <div key={idx.code} className="border border-border bg-white px-3 py-2.5 hover:border-cyan transition-colors">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-[12px] font-bold text-navy">{idx.name}</span>
              {idx.changePct != null && (
                <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
                  {arrow} {Math.abs(idx.changePct).toFixed(2)}%
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[16px] lg:text-[18px] font-bold tabular-nums text-text leading-none">
                {idx.price != null ? fmtPrice(idx.price, idx.currency) : '—'}
              </span>
              <div className="w-[100px] h-[28px] flex-shrink-0">
                <Sparkline data={idx.history} color={color} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
