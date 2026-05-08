// 핫 단지 — 라이트 프리미엄. 부동산 게시판 헤더용.
import Link from 'next/link';
import type { HotApt } from '@/lib/realty-snapshot';

export default function HotAptsSection({ apts }: { apts: HotApt[] }) {
  if (apts.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[15px] font-bold text-navy tracking-tight">🏆 핫한 단지</h2>
        <span className="text-[11px] text-muted">최근 14일 토론 많은 순</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {apts.map((a, i) => (
          <Link
            key={a.id}
            href={`/apt/${a.id}`}
            className="relative px-4 py-3 overflow-hidden bg-white border border-border hover:border-navy hover:shadow-[0_6px_24px_rgba(0,32,96,0.1)] transition-all duration-200 no-underline block"
          >
            <div aria-hidden className="absolute top-0 left-0 right-0 h-px"
                 style={{ background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.5), transparent)' }} />
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold tabular-nums text-[#c9a227] w-4 shrink-0">#{i + 1}</span>
              <span className="text-[15px] font-bold text-navy truncate">{a.apt_nm}</span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[12px] text-muted">{a.dong ?? ''}</span>
              {a.discussion_count > 0 && (
                <span className="text-[11px] font-bold tabular-nums text-[#c9a227]">
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
