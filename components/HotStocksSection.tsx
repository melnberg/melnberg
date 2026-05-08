// 인기 종목 — 다크 프리미엄. 글래스 카드 + 네온 가격 + 영역 차트.
import Link from 'next/link';
import type { HotStock } from '@/lib/market-snapshot';

function fmtPrice(n: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n.toLocaleString();
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 200, h = 56, pad = 2;
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
  const gid = `gh-${color.replace('#', '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${color}90)` }} />
    </svg>
  );
}

export default function HotStocksSection({ stocks, label = '🔥 인기 종목', sub = '최근 14일 토론 많은 순' }: { stocks: HotStock[]; label?: string; sub?: string }) {
  if (stocks.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[15px] font-bold text-white tracking-tight">{label}</h2>
        <span className="text-[11px] text-white/50">{sub}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {stocks.map((s, i) => {
          const up = s.changePct != null && s.changePct > 0;
          const down = s.changePct != null && s.changePct < 0;
          const color = up ? '#22e0a1' : down ? '#ff4f6d' : '#7d8aa0';
          const arrow = up ? '▲' : down ? '▼' : '–';
          return (
            <Link
              key={s.code}
              href={`/stocks?tag=${encodeURIComponent(s.code)}`}
              scroll={false}
              className="relative px-4 py-3 overflow-hidden border border-white/10 hover:border-white/30 transition-all no-underline block"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))',
                backdropFilter: 'blur(6px)',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold tabular-nums text-white/40 w-4 shrink-0">#{i + 1}</span>
                  <span className="text-[14px] font-bold text-white truncate">{s.name}</span>
                  <span className="text-[10px] text-white/40 tabular-nums shrink-0">{s.code}</span>
                </div>
                <span className="text-[10px] font-bold bg-white/10 text-white px-1.5 py-0.5 shrink-0 rounded-sm">
                  💬 {s.postCount}
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[16px] font-bold tabular-nums text-white leading-tight">
                    {s.price != null ? fmtPrice(s.price, s.currency) : '—'}
                  </span>
                  {s.changePct != null && (
                    <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color, textShadow: `0 0 6px ${color}80` }}>
                      {arrow} {Math.abs(s.changePct).toFixed(2)}%
                    </span>
                  )}
                </div>
                <div className="w-[140px] h-[44px] shrink-0 -mb-1">
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
