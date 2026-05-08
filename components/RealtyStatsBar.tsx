// 부동산 게시판 헤더 — 4개 스탯 카드 (다크 + 골드/장미/하늘/에메랄드 액센트).
import type { RealtyStat } from '@/lib/realty-snapshot';

const ACCENTS: Record<RealtyStat['accent'], { color: string; bg: string }> = {
  gold:    { color: '#ffd166', bg: 'linear-gradient(135deg, rgba(255,209,102,0.12), rgba(255,255,255,0.012))' },
  rose:    { color: '#ff6b9b', bg: 'linear-gradient(135deg, rgba(255,107,155,0.12), rgba(255,255,255,0.012))' },
  azure:   { color: '#79bdff', bg: 'linear-gradient(135deg, rgba(121,189,255,0.12), rgba(255,255,255,0.012))' },
  emerald: { color: '#22e0a1', bg: 'linear-gradient(135deg, rgba(34,224,161,0.12), rgba(255,255,255,0.012))' },
};

export default function RealtyStatsBar({ stats }: { stats: RealtyStat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
      {stats.map((s) => {
        const a = ACCENTS[s.accent];
        return (
          <div
            key={s.label}
            className="relative px-4 py-3 overflow-hidden border border-white/10 hover:border-white/30 transition-all"
            style={{ background: a.bg, backdropFilter: 'blur(6px)' }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold tracking-widest uppercase text-white/70">{s.label}</span>
              <span className="text-[10px] font-bold tracking-widest" style={{ color: a.color, textShadow: `0 0 6px ${a.color}80` }}>
                {s.sub}
              </span>
            </div>
            <div className="text-[24px] lg:text-[28px] font-black tabular-nums text-white leading-none"
                 style={{ textShadow: `0 0 20px ${a.color}40` }}>
              {s.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
