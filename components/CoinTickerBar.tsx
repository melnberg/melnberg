// 코인 메이저 4종 — 다크 + 골드/오렌지/퍼플 그라디언트 (코인 게시판 톤).
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
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${color}90)` }} />
    </svg>
  );
}

const SYMBOL_GRAD: Record<string, string> = {
  'KRW-BTC': 'linear-gradient(135deg, rgba(247,147,26,0.12), rgba(255,200,80,0.04))',
  'KRW-ETH': 'linear-gradient(135deg, rgba(140,160,255,0.12), rgba(110,90,255,0.04))',
  'KRW-XRP': 'linear-gradient(135deg, rgba(0,200,200,0.12), rgba(80,180,255,0.04))',
  'KRW-DOGE': 'linear-gradient(135deg, rgba(255,210,80,0.12), rgba(220,160,40,0.04))',
};

export default function CoinTickerBar({ indices }: { indices: CoinIndex[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
      {indices.map((c) => {
        const up = c.changePct != null && c.changePct > 0;
        const down = c.changePct != null && c.changePct < 0;
        const color = up ? '#22e0a1' : down ? '#ff4f6d' : '#7d8aa0';
        const arrow = up ? '▲' : down ? '▼' : '–';
        const sym = c.code.replace('KRW-', '');
        return (
          <div
            key={c.code}
            className="relative px-4 py-3 overflow-hidden border border-white/10 hover:border-white/30 transition-all"
            style={{
              background: SYMBOL_GRAD[c.code] ?? 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-bold tracking-widest uppercase text-white/80">{c.name}</span>
                <span className="text-[10px] text-white/40">{sym}</span>
              </div>
              {c.changePct != null && (
                <span className="text-[12px] font-bold tabular-nums" style={{ color, textShadow: `0 0 8px ${color}80` }}>
                  {arrow} {Math.abs(c.changePct).toFixed(2)}%
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[18px] lg:text-[20px] font-bold tabular-nums text-white leading-none">
                {c.price != null ? `₩${fmtKrw(c.price)}` : '—'}
              </span>
              <div className="w-[110px] h-[34px] flex-shrink-0 -mb-1">
                <Sparkline data={c.history} color={color} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
