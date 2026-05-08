// 인기 코인 — 라이트 프리미엄.
import Link from 'next/link';
import type { HotCoin } from '@/lib/coin-snapshot';

function fmtKrw(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}만`;
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
  const gid = `gc-${color.replace('#', '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#${gid})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function HotCoinsSection({ coins }: { coins: HotCoin[] }) {
  if (coins.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[15px] font-bold text-navy tracking-tight">🚀 떡상 코인</h2>
        <span className="text-[11px] text-muted">최근 14일 토론 많은 순</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {coins.map((s, i) => {
          const up = s.changePct != null && s.changePct > 0;
          const down = s.changePct != null && s.changePct < 0;
          const color = up ? '#dc2626' : down ? '#2563eb' : '#9ca3af';
          const arrow = up ? '▲' : down ? '▼' : '–';
          const sym = s.code.replace('KRW-', '');
          return (
            <Link
              key={s.code}
              href={`/coin?tag=${encodeURIComponent(s.code)}`}
              scroll={false}
              className="relative px-4 py-3 overflow-hidden bg-white border border-border hover:border-navy hover:shadow-[0_6px_24px_rgba(0,32,96,0.1)] transition-all duration-200 no-underline block"
            >
              <div aria-hidden className="absolute top-0 left-0 right-0 h-px"
                   style={{ background: 'linear-gradient(90deg, transparent, rgba(247,147,26,0.5), transparent)' }} />
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold tabular-nums text-[#f7931a] w-4 shrink-0">#{i + 1}</span>
                  <span className="text-[14px] font-bold text-navy truncate">{s.name}</span>
                  <span className="text-[10px] text-muted tabular-nums shrink-0">{sym}</span>
                </div>
                <span className="text-[10px] font-bold bg-[#f7931a]/10 text-[#b56700] px-1.5 py-0.5 shrink-0">
                  💬 {s.postCount}
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[16px] font-bold tabular-nums text-text leading-tight">
                    {s.price != null ? `₩${fmtKrw(s.price)}` : '—'}
                  </span>
                  {s.changePct != null && (
                    <span className="text-[12px] font-bold tabular-nums leading-tight" style={{ color }}>
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
