'use client';

import { useEffect, useState } from 'react';

export type StockInfo = {
  code: string;
  reutersCode?: string;
  name: string;
  nameEng?: string | null;
  foreign?: boolean;
  currency?: string | null;
  exchange?: string | null;
  exchangeKor?: string | null;
  nation?: string | null;
  industry?: string | null;
  marketStatus?: string | null;
  localTradedAt?: string | null;

  price: number | null;
  lastClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: string | null;
  tradingValue?: string | null;
  marketCap: string | null;
  foreignRate: string | null;
  per: string | null;
  eps: string | null;
  pbr: string | null;
  bps?: string | null;
  dividend?: string | null;
  dividendYield: string | null;
  dividendAt?: string | null;
  high52: number | null;
  low52: number | null;
  after?: {
    price: number | null;
    change: number | null;
    ratio: number | null;
    direction: string | null;
    session: string | null;
  } | null;
  history: Array<{ date: string; close: number; open?: number; high?: number; low?: number; change: number; direction: string | null; volume: number }>;
};

// SVG 라인차트 (sparkline) — 종가 추이.
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

// 가격 포맷 — 한국주식은 원화 정수, 미국주식은 소수 둘째자리 + $.
function fmtPrice(n: number, foreign: boolean | undefined, currency: string | null | undefined): string {
  if (foreign || currency === 'USD') {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return n.toLocaleString();
}

function fmtChange(n: number, foreign: boolean | undefined): string {
  if (foreign) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString();
}

export default function StockInfoCard({ code, compact = false, kind = 'stock', theme = 'light' }: { code: string; compact?: boolean; kind?: 'stock' | 'coin'; theme?: 'light' | 'dark' }) {
  const dark = theme === 'dark';
  // 다크 톤 컬러 — 기본 클래스 대체
  const cls = {
    card: dark
      ? 'border border-white/15 px-4 py-3'
      : 'border border-cyan/40 bg-cyan/5 px-4 py-3',
    cardStyle: dark
      ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', backdropFilter: 'blur(6px)' }
      : undefined,
    name: dark ? 'text-white' : 'text-navy',
    sub: dark ? 'text-white/50' : 'text-muted',
    body: dark ? 'text-white' : 'text-text',
    chip: dark ? 'bg-white/10 text-white/90' : 'bg-navy/10 text-navy',
    chipSubtle: dark ? 'bg-white/5 text-white/80' : 'bg-navy/5 text-navy',
    border: dark ? 'border-white/10' : 'border-border/40',
  };
  const [info, setInfo] = useState<StockInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setErr(null);
    (async () => {
      try {
        const endpoint = kind === 'coin' ? '/api/coin/info' : '/api/stock/info';
        const r = await fetch(`${endpoint}?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !j?.ok) { setErr(j?.error ?? '시세 가져오기 실패'); return; }
        setInfo(j as StockInfo);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '실패');
      }
    })();
    return () => { cancelled = true; };
  }, [code, kind]);

  if (err) return <div className="border border-red-200 bg-red-50 text-red-700 text-[12px] px-3 py-2">시세 정보 가져오기 실패: {err}</div>;
  if (!info) return <div className="border border-border bg-bg/30 px-3 py-3 text-[12px] text-muted">시세 불러오는 중...</div>;

  const change = info.price != null && info.lastClose != null ? info.price - info.lastClose : null;
  const pct = change != null && info.lastClose ? (change / info.lastClose * 100) : null;
  const up = pct != null && pct > 0;
  const down = pct != null && pct < 0;
  const color = up ? 'text-[#dc2626]' : down ? 'text-[#2563eb]' : 'text-muted';
  const arrow = up ? '▲' : down ? '▼' : '–';

  // 시간외 색상
  const afterUp = info.after?.direction === 'RISING';
  const afterDown = info.after?.direction === 'FALLING';
  const afterColor = afterUp ? 'text-[#dc2626]' : afterDown ? 'text-[#2563eb]' : 'text-muted';
  const afterArrow = afterUp ? '▲' : afterDown ? '▼' : '–';
  const sessionLabel = info.after?.session === 'PRE_MARKET' ? '프리마켓' : info.after?.session === 'AFTER_MARKET' ? '애프터마켓' : '시간외';

  return (
    <div className={cls.card} style={cls.cardStyle}>
      {/* 헤더 — 이름 + 코드 + 거래소/업종 + 가격 */}
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-[15px] font-bold ${cls.name}`}>{kind === 'coin' ? '₿' : '📈'} {info.name}</span>
          <span className={`text-[11px] tabular-nums ${cls.sub}`}>{info.code}</span>
          {info.exchange && <span className={`text-[10px] px-1.5 py-px font-semibold rounded ${cls.chip}`}>{info.exchange}</span>}
          {info.industry && <span className={`text-[10px] ${cls.sub}`}>· {info.industry}</span>}
        </div>
        {info.price != null && (
          <div className="flex items-baseline gap-2">
            <span className={`text-[18px] font-bold tabular-nums ${cls.body}`}>{fmtPrice(info.price, info.foreign, info.currency)}</span>
            {pct != null && (
              <span className={`text-[12px] font-bold tabular-nums ${color}`}>
                {arrow} {fmtChange(Math.abs(change ?? 0), info.foreign)} ({Math.abs(pct).toFixed(2)}%)
              </span>
            )}
          </div>
        )}
      </div>

      {/* 시간외 (미국주식 전용) */}
      {info.after && info.after.price != null && (
        <div className={`text-[11px] mb-2 flex items-center gap-1.5 flex-wrap ${cls.sub}`}>
          <span className={`px-1.5 py-px font-semibold rounded ${cls.chipSubtle}`}>{sessionLabel}</span>
          <span className={`font-semibold tabular-nums ${cls.body}`}>{fmtPrice(info.after.price, info.foreign, info.currency)}</span>
          {info.after.change != null && info.after.ratio != null && (
            <span className={`font-bold tabular-nums ${afterColor}`}>
              {afterArrow} {fmtChange(Math.abs(info.after.change), info.foreign)} ({Math.abs(info.after.ratio).toFixed(2)}%)
            </span>
          )}
        </div>
      )}

      {/* 차트 */}
      {info.history.length > 1 && <div className="mb-2"><Sparkline data={info.history} /></div>}

      {/* 시고저 — 항상 노출 */}
      {(info.open != null || info.high != null || info.low != null) && (
        <div className={`grid grid-cols-3 gap-x-3 text-[11px] mb-1.5 pb-1.5 border-b ${cls.border}`}>
          {info.open != null && <div className="flex justify-between"><span className={cls.sub}>시가</span><span className={`font-semibold tabular-nums ${cls.body}`}>{fmtPrice(info.open, info.foreign, info.currency)}</span></div>}
          {info.high != null && <div className="flex justify-between"><span className={cls.sub}>고가</span><span className="font-semibold tabular-nums text-[#dc2626]">{fmtPrice(info.high, info.foreign, info.currency)}</span></div>}
          {info.low != null && <div className="flex justify-between"><span className={cls.sub}>저가</span><span className="font-semibold tabular-nums text-[#2563eb]">{fmtPrice(info.low, info.foreign, info.currency)}</span></div>}
        </div>
      )}

      {/* 기본 정보 (compact 모드면 핵심만) */}
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'} gap-x-3 gap-y-1 text-[11px]`}>
        {info.marketCap && <div className="flex justify-between"><span className={cls.sub}>시총</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.marketCap}</span></div>}
        {info.volume && <div className="flex justify-between"><span className={cls.sub}>거래량</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.volume}</span></div>}
        {info.tradingValue && <div className="flex justify-between"><span className={cls.sub}>거래대금</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.tradingValue}</span></div>}
        {info.per && <div className="flex justify-between"><span className={cls.sub}>PER</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.per}</span></div>}
        {info.pbr && <div className="flex justify-between"><span className={cls.sub}>PBR</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.pbr}</span></div>}
        {!compact && (
          <>
            {info.eps && <div className="flex justify-between"><span className={cls.sub}>EPS</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.eps}</span></div>}
            {info.bps && <div className="flex justify-between"><span className={cls.sub}>BPS</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.bps}</span></div>}
            {info.high52 != null && <div className="flex justify-between"><span className={cls.sub}>52주 최고</span><span className={`font-semibold tabular-nums ${cls.body}`}>{fmtPrice(info.high52, info.foreign, info.currency)}</span></div>}
            {info.low52 != null && <div className="flex justify-between"><span className={cls.sub}>52주 최저</span><span className={`font-semibold tabular-nums ${cls.body}`}>{fmtPrice(info.low52, info.foreign, info.currency)}</span></div>}
            {info.foreignRate && <div className="flex justify-between"><span className={cls.sub}>외인비중</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.foreignRate}</span></div>}
            {info.dividendYield && info.dividendYield !== '0.00%' && info.dividendYield !== '0.00' && <div className="flex justify-between"><span className={cls.sub}>배당수익률</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.dividendYield}</span></div>}
            {info.dividend && info.dividend !== '0.00' && info.dividend !== '0' && <div className="flex justify-between"><span className={cls.sub}>배당금</span><span className={`font-semibold tabular-nums ${cls.body}`}>{info.dividend}</span></div>}
          </>
        )}
      </div>
    </div>
  );
}
