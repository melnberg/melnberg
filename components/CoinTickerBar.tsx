// 코인 메이저 4종 — 라이트 프리미엄. 화이트 카드 + 코인별 시그니처 컬러 라인.
import type { CoinIndex } from '@/lib/coin-snapshot';

function fmtKrw(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}만`;
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
  const gid = `cgrad-${color.replace('#', '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// 코인별 시그니처 — 상단 라인 색
const SYMBOL_COLOR: Record<string, string> = {
  'KRW-BTC': '#f7931a',  // 비트 오렌지
  'KRW-ETH': '#627eea',  // 이더 블루퍼플
  'KRW-XRP': '#23292f',  // 리플 그라파이트
  'KRW-DOGE': '#c2a633', // 도지 골드
};

export default function CoinTickerBar({ indices }: { indices: CoinIndex[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
      {indices.map((c) => {
        const up = c.changePct != null && c.changePct > 0;
        const down = c.changePct != null && c.changePct < 0;
        const change = up ? '#dc2626' : down ? '#2563eb' : '#9ca3af';
        const arrow = up ? '▲' : down ? '▼' : '–';
        const sym = c.code.replace('KRW-', '');
        const sigColor = SYMBOL_COLOR[c.code] ?? '#999';
        return (
          <div
            key={c.code}
            className="relative px-4 py-3 overflow-hidden bg-white border border-border hover:border-navy hover:shadow-[0_4px_20px_rgba(0,32,96,0.08)] transition-all duration-200"
          >
            {/* 시그니처 컬러 라인 */}
            <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: sigColor }} />
            <div className="flex items-baseline justify-between gap-2 mb-1.5 mt-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-bold tracking-widest uppercase text-navy/80">{c.name}</span>
                <span className="text-[10px] text-muted">{sym}</span>
              </div>
              {c.changePct != null && (
                <span className="text-[12px] font-bold tabular-nums" style={{ color: change }}>
                  {arrow} {Math.abs(c.changePct).toFixed(2)}%
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[18px] lg:text-[20px] font-bold tabular-nums text-text leading-none whitespace-nowrap">
                {c.price != null ? `₩${fmtKrw(c.price)}` : '—'}
              </span>
              <div className="w-[110px] h-[34px] flex-shrink-0 -mb-1">
                <Sparkline data={c.history} color={change} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
