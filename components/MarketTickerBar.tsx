// 마켓 인덱스 — 다크 프리미엄 변형 (코스피/코스닥/SPY/BTC).
// 글래스모피즘 카드 + 네온 변동률 + 글로우.
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
  // 면적(grad) — 라인 아래 살짝.
  const areaPts = `${pad},${h} ${points} ${(pad + (data.length - 1) * step).toFixed(1)},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color}90)` }} />
    </svg>
  );
}

export default function MarketTickerBar({ indices }: { indices: MarketIndex[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
      {indices.map((idx) => {
        const up = idx.changePct != null && idx.changePct > 0;
        const down = idx.changePct != null && idx.changePct < 0;
        // 다크 모드 — 상승=네온 그린, 하락=네온 핑크/레드.
        const color = up ? '#22e0a1' : down ? '#ff4f6d' : '#7d8aa0';
        const arrow = up ? '▲' : down ? '▼' : '–';
        return (
          <div
            key={idx.code}
            className="relative px-4 py-3 overflow-hidden border border-white/10 hover:border-white/25 transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold tracking-widest uppercase text-white/70">{idx.name}</span>
              {idx.changePct != null && (
                <span className="text-[12px] font-bold tabular-nums" style={{ color, textShadow: `0 0 8px ${color}80` }}>
                  {arrow} {Math.abs(idx.changePct).toFixed(2)}%
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[18px] lg:text-[20px] font-bold tabular-nums text-white leading-none">
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
