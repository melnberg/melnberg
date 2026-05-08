// 핫 단지 — 최근 14일 토론 많은 단지 6 카드. 부동산 게시판 헤더용.
import Link from 'next/link';
import type { HotApt } from '@/lib/realty-snapshot';

export default function HotAptsSection({ apts }: { apts: HotApt[] }) {
  if (apts.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[15px] font-bold text-white tracking-tight">🏆 핫한 단지</h2>
        <span className="text-[11px] text-white/50">최근 14일 토론 많은 순</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {apts.map((a, i) => (
          <Link
            key={a.id}
            href={`/?focus=${a.id}`}
            className="relative px-4 py-3 overflow-hidden border border-white/10 hover:border-white/30 transition-all no-underline block"
            style={{
              background: 'linear-gradient(135deg, rgba(255,209,102,0.06), rgba(255,255,255,0.012))',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tabular-nums text-white/40 w-4 shrink-0">#{i + 1}</span>
              <span className="text-[15px] font-bold text-white truncate">{a.apt_nm}</span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[12px] text-white/50">{a.dong ?? ''}</span>
              {a.discussion_count > 0 && (
                <span className="text-[11px] font-bold tabular-nums text-amber-300" style={{ textShadow: '0 0 5px rgba(255,209,102,0.5)' }}>
                  💬 {a.discussion_count}건
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
