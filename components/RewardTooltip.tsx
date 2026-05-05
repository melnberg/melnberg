'use client';

import { useState } from 'react';

// +N mlbg 뱃지 + hover 시 보상 지급 기준 박스 표시
type Props = {
  earned: number;
  kind?: 'apt_post' | 'apt_comment' | 'community_post' | 'hotdeal_post' | 'community_comment' | 'hotdeal_comment';
};

export default function RewardTooltip({ earned }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className="tabular-nums cursor-default"
        style={{ font: 'inherit', color: 'inherit' }}
      >
        +{earned} mlbg
      </span>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-[260px] bg-navy text-white text-[11px] leading-relaxed shadow-xl">
          <div className="px-4 py-2.5 border-b border-cyan/30 text-cyan font-bold tracking-[0.18em] uppercase text-[10px]">
            보상 지급 기준
          </div>
          <ul className="px-4 py-3 space-y-2">
            <li className="flex items-center gap-2.5">
              <Dot color="#00B0F0" />
              <span className="flex-1">단지 토론 1~20자</span>
              <span className="tabular-nums text-white/80">+0</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Dot color="#00B0F0" />
              <span className="flex-1">단지 토론 21~99자</span>
              <span className="tabular-nums text-white/80">+2</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Dot color="#00B0F0" />
              <span className="flex-1">단지 토론 100~199자</span>
              <span className="tabular-nums text-white/80">+3</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Dot color="#00B0F0" />
              <span className="flex-1">단지 토론 200자+</span>
              <span className="tabular-nums text-white/80">+5</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Dot color="#0070C0" />
              <span className="flex-1">커뮤·핫딜 글</span>
              <span className="tabular-nums text-white/80">+2</span>
            </li>
            <li className="flex items-center gap-2.5">
              <Dot color="#d4d4d4" />
              <span className="flex-1">댓글 (어디든)</span>
              <span className="tabular-nums text-white/80">+1</span>
            </li>
          </ul>
          <div className="px-4 py-2.5 border-t border-white/15 text-[10px] text-white/70 leading-snug">
            작성 시 작성자에게 자동 적립됩니다.
          </div>
        </div>
      )}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block rounded-full"
      style={{ width: 11, height: 11, backgroundColor: color, flexShrink: 0 }}
    />
  );
}
