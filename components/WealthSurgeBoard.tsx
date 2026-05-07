import type { CSSProperties } from 'react';
import { createPublicClient } from '@/lib/supabase/public';

// 자산 급등 TOP 30 전광판 — /ranking 상단.
// 어제 스냅샷(wealth_ranking_snapshots) 에 있던 사용자만, 오늘 자산이 어제보다 늘어난 사람만.
// 데이터 0건이면 null — 첫 운영일/스냅샷 비어있을 때 빈 띠 안 띄움.

type SurgeRow = {
  rank: number;
  user_id: string;
  display_name: string | null;
  today_wealth: number;
  yesterday_wealth: number;
  delta: number;
  delta_pct: number | null;
};

function fmtDelta(n: number): string {
  return Math.round(Number(n ?? 0)).toLocaleString();
}

function Item({ r }: { r: SurgeRow }) {
  return (
    <span className="inline-flex items-center gap-1.5 mx-4 text-[12px] whitespace-nowrap">
      <span className="text-cyan/70 tabular-nums">{r.rank}.</span>
      <span className="text-white">{r.display_name ?? '익명'}</span>
      <span className="text-cyan font-bold tabular-nums">+{fmtDelta(r.delta)}</span>
      {r.delta_pct !== null && r.delta_pct !== undefined ? (
        <span className="text-cyan/60 tabular-nums">({Number(r.delta_pct).toFixed(1)}%)</span>
      ) : null}
    </span>
  );
}

export default async function WealthSurgeBoard() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .rpc('get_wealth_surge_top', { p_limit: 30 })
    .then((r) => r, () => ({ data: null }));

  const rows = (data ?? []) as SurgeRow[];
  if (!rows.length) return null;

  // CSS variable 을 inline style 로 — TS 회피용 캐스팅
  const trackStyle = { ['--marquee-duration' as string]: '60s' } as CSSProperties;

  return (
    <div className="w-full bg-navy text-white">
      <div className="max-w-content mx-auto flex items-stretch">
        {/* 좌측 고정 라벨 */}
        <div className="flex-shrink-0 bg-[#001540] px-3 py-2 sm:px-4 sm:py-2.5 flex flex-col justify-center">
          <div className="text-cyan text-[11px] sm:text-[12px] font-bold whitespace-nowrap leading-tight">
            <span className="mr-1">⚡</span>자산 급등 TOP 30
          </div>
          <div className="text-cyan/60 text-[9px] sm:text-[10px] whitespace-nowrap leading-tight mt-0.5">
            어제 스냅샷 → 오늘 실시간
          </div>
        </div>

        {/* 우측 마퀴 */}
        <div className="marquee-mask flex-1 min-w-0 overflow-hidden flex items-center py-2">
          <div className="marquee-track flex" style={trackStyle}>
            {/* 무한 스크롤용 카피 2번 */}
            <div className="flex flex-shrink-0">
              {rows.map((r) => (
                <Item key={`a-${r.user_id}`} r={r} />
              ))}
            </div>
            <div className="flex flex-shrink-0" aria-hidden>
              {rows.map((r) => (
                <Item key={`b-${r.user_id}`} r={r} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
