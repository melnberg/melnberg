'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// +N mlbg 뱃지 + hover 시 보상 지급 기준 박스 표시 (portal — overflow:hidden 컨테이너 무시)
type Props = {
  earned: number;
  kind?: 'apt_post' | 'apt_comment' | 'community_post' | 'hotdeal_post' | 'community_comment' | 'hotdeal_comment';
};

type Pos = { top: number; left: number };

export default function RewardTooltip({ earned }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => { setMounted(true); }, []);

  function updatePos() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const W = 260;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - W - 8);
    setPos({ top: r.bottom + 4, left });
  }

  function onEnter() {
    updatePos();
    setOpen(true);
  }

  return (
    <>
      <span
        ref={triggerRef}
        className="tabular-nums cursor-default inline-block"
        style={{ font: 'inherit', color: 'inherit' }}
        onMouseEnter={onEnter}
        onMouseLeave={() => setOpen(false)}
      >
        +{earned} mlbg
      </span>
      {mounted && open && pos && createPortal(
        <div
          className="fixed z-[1000] w-[260px] text-[11px] leading-relaxed"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="bg-navy text-white shadow-xl">
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
                <span className="tabular-nums text-white/80">+0.5</span>
              </li>
            </ul>
            <div className="px-4 py-2.5 border-t border-white/15 text-[10px] text-white/70 leading-snug">
              작성 시 작성자에게 자동 적립됩니다.
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
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
