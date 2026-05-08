// 부동산 게시판 헤더 — 4개 스탯 카드. 라이트 프리미엄, 액센트별 상단 라인.
import type { RealtyStat } from '@/lib/realty-snapshot';

const ACCENTS: Record<RealtyStat['accent'], { color: string; tint: string }> = {
  gold:    { color: '#c9a227', tint: '#fff8e1' },
  rose:    { color: '#d6336c', tint: '#fff0f3' },
  azure:   { color: '#1971c2', tint: '#e7f5ff' },
  emerald: { color: '#0a8a3f', tint: '#ecfdf5' },
};

export default function RealtyStatsBar({ stats }: { stats: RealtyStat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
      {stats.map((s) => {
        const a = ACCENTS[s.accent];
        return (
          <div
            key={s.label}
            className="relative px-4 py-3 overflow-hidden bg-white border border-border hover:border-navy hover:shadow-[0_4px_20px_rgba(0,32,96,0.08)] transition-all duration-200"
          >
            {/* 액센트 상단 라인 */}
            <div aria-hidden className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: a.color }} />
            <div className="flex items-baseline justify-between gap-2 mb-1.5 mt-1">
              <span className="text-[11px] font-bold tracking-widest uppercase text-navy/70">{s.label}</span>
              <span className="text-[10px] font-bold tracking-widest px-1.5 py-px" style={{ color: a.color, background: a.tint }}>
                {s.sub}
              </span>
            </div>
            <div className="text-[24px] lg:text-[28px] font-black tabular-nums text-text leading-none">
              {s.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
