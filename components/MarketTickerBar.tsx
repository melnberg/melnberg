// 마켓 인덱스 — 라이트 프리미엄. 화이트 카드 + 미세 그라디언트 + 네온 sparkline.
import type { MarketIndex } from '@/lib/market-snapshot';

function fmtPrice(n: number, currency: 'KRW' | 'USD' | 'CRYPTO'): string {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString();
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 140, h = 38, pad = 1;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  const points = data.map((c, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (c - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const areaPts = `${pad},${h} ${points} ${(pad + (data.length - 1) * step).toFixed(1)},${h}`;
  const gid = `mtgrad-${color.replace('#', '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function MarketTickerBar({ indices }: { indices: MarketIndex[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
      {indices.map((idx) => {
        const up = idx.changePct != null && idx.changePct > 0;
        const down = idx.changePct != null && idx.changePct < 0;
        // 라이트 모드 — 상승=레드, 하락=블루 (한국 증시 컨벤션)
        const color = up ? '#dc2626' : down ? '#2563eb' : '#9ca3af';
        const arrow = up ? '▲' : down ? '▼' : '–';
        return (
          <div
            key={idx.code}
            className="relative px-4 py-3 overflow-hidden bg-white border border-border hover:border-navy hover:shadow-[0_4px_20px_rgba(0,32,96,0.08)] transition-all duration-200"
          >
            {/* 미세한 안쪽 highlight */}
            <div aria-hidden className="absolute top-0 left-0 right-0 h-px"
                 style={{ background: `linear-gradient(90deg, transparent, ${color}55, transparent)` }} />
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold tracking-widest uppercase text-navy/70">{idx.name}</span>
              {idx.changePct != null && (
                <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
                  {arrow} {Math.abs(idx.changePct).toFixed(2)}%
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[18px] lg:text-[20px] font-bold tabular-nums text-text leading-none">
                {idx.price != null ? fmtPrice(idx.price, idx.currency) : '—'}
              </span>
              <div className="w-[110px] h-[34px] flex-shrink-0 -mb-1">
                <Sparkline data={idx.history} color={color} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
