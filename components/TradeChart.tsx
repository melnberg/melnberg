'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Trade = { deal_date: string; deal_amount: number; excl_use_ar: number; floor_no: number | null; area_group: number };
type Summary = { total_count: number; median_amount: number; avg_amount: number; min_amount: number; max_amount: number; last_deal_date: string | null };

function fmtAmount(만원: number): string {
  // 만원 단위 → 억원/만원 변환
  if (만원 >= 10000) {
    const 억 = Math.floor(만원 / 10000);
    const 만 = 만원 % 10000;
    return 만 > 0 ? `${억}억 ${만.toLocaleString()}` : `${억}억`;
  }
  return `${만원.toLocaleString()}만`;
}

function fmtDate(iso: string): string {
  return iso.slice(2, 10).replace(/-/g, '.');
}

export default function TradeChart({ aptId }: { aptId: number }) {
  const supabase = createClient();
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: tData }, { data: sData }] = await Promise.all([
        supabase.rpc('get_apt_recent_trades', { p_apt_id: aptId, p_months: 12 })
          .then((r) => r, () => ({ data: null })),
        supabase.rpc('get_apt_trade_summary', { p_apt_id: aptId, p_months: 12 })
          .then((r) => r, () => ({ data: null })),
      ]);
      if (cancelled) return;
      setTrades(((tData ?? []) as Trade[]).map((t) => ({ ...t, deal_amount: Number(t.deal_amount), excl_use_ar: Number(t.excl_use_ar) })));
      const s = (Array.isArray(sData) ? sData[0] : sData) as Summary | null;
      setSummary(s ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [aptId, supabase]);

  if (loading) return null;
  if (!trades || trades.length === 0) {
    return (
      <div className="px-3 py-2 bg-bg/40 border border-border text-[11px] text-muted text-center">
        최근 12개월 실거래 데이터 없음
      </div>
    );
  }

  // 평형별 그룹핑 (가장 많은 평형 1개만 차트)
  const byArea = new Map<number, Trade[]>();
  for (const t of trades) {
    const list = byArea.get(t.area_group) ?? [];
    list.push(t);
    byArea.set(t.area_group, list);
  }
  // 거래 많은 평형 순
  const topArea = Array.from(byArea.entries())
    .sort((a, b) => b[1].length - a[1].length)[0];
  const [areaGroup, areaTrades] = topArea;

  // SVG sparkline
  const W = 280, H = 70, PAD_X = 4, PAD_Y = 6;
  const sorted = [...areaTrades].sort((a, b) => a.deal_date.localeCompare(b.deal_date));
  const amounts = sorted.map((t) => t.deal_amount);
  const dates = sorted.map((t) => new Date(t.deal_date).getTime());
  const minA = Math.min(...amounts), maxA = Math.max(...amounts);
  const minD = Math.min(...dates), maxD = Math.max(...dates);
  const rangeA = Math.max(maxA - minA, 1);
  const rangeD = Math.max(maxD - minD, 1);
  const points = sorted.map((t) => {
    const x = PAD_X + ((new Date(t.deal_date).getTime() - minD) / rangeD) * (W - 2 * PAD_X);
    const y = H - PAD_Y - ((t.deal_amount - minA) / rangeA) * (H - 2 * PAD_Y);
    return { x, y, t };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const lastPt = points[points.length - 1];
  const firstPt = points[0];

  return (
    <div className="border border-border bg-white">
      <div className="px-3 py-2 bg-bg/40 border-b border-border flex items-center justify-between text-[11px]">
        <span className="font-bold text-navy tracking-wider uppercase text-[10px]">실거래가 ({areaGroup}~{areaGroup + 5}㎡)</span>
        <span className="text-muted">최근 12개월 · {areaTrades.length}건</span>
      </div>
      {summary && (
        <div className="px-3 py-1.5 grid grid-cols-3 gap-2 text-[11px] border-b border-border bg-white">
          <div>
            <div className="text-muted text-[10px]">중앙값</div>
            <div className="font-bold text-navy tabular-nums">{fmtAmount(summary.median_amount)}</div>
          </div>
          <div>
            <div className="text-muted text-[10px]">최저</div>
            <div className="font-medium text-text tabular-nums">{fmtAmount(summary.min_amount)}</div>
          </div>
          <div>
            <div className="text-muted text-[10px]">최고</div>
            <div className="font-medium text-text tabular-nums">{fmtAmount(summary.max_amount)}</div>
          </div>
        </div>
      )}
      <div className="px-2 pt-2 pb-1 bg-white">
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path d={pathD} fill="none" stroke="#0070C0" strokeWidth="1.5" />
          {/* 시작·끝 점만 강조 */}
          <circle cx={firstPt.x} cy={firstPt.y} r={2.5} fill="#94a3b8" />
          <circle cx={lastPt.x} cy={lastPt.y} r={3} fill="#0070C0" />
        </svg>
      </div>
      <div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-muted tabular-nums border-t border-border">
        <span>{fmtDate(sorted[0].deal_date)} {fmtAmount(sorted[0].deal_amount)}</span>
        <span className="text-navy font-bold">→</span>
        <span>{fmtDate(sorted[sorted.length - 1].deal_date)} {fmtAmount(sorted[sorted.length - 1].deal_amount)}</span>
      </div>
    </div>
  );
}
