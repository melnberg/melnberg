'use client';

import { useState, useRef, useEffect } from 'react';

// +N mlbg 뱃지 + hover 시 보상 기준 박스 표시
type Props = {
  earned: number;
  kind?: 'apt_post' | 'apt_comment' | 'community_post' | 'hotdeal_post' | 'community_comment' | 'hotdeal_comment';
};

export default function RewardTooltip({ earned, kind }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isComment = kind?.endsWith('_comment');
  const isAptPost = kind === 'apt_post';

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`tabular-nums bg-transparent border-none p-0 cursor-pointer ${earned > 0 ? 'text-cyan font-bold' : 'text-muted'}`}
      >
        +{earned}{kind ? ' mlbg' : ''}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-[260px] bg-navy text-white shadow-[0_8px_24px_rgba(0,32,96,0.25)] border border-navy-dark">
          <div className="px-4 pt-3 pb-2 text-[11px] font-bold tracking-widest uppercase border-b border-white/15">
            보상 지급 기준
          </div>
          <ul className="px-4 py-3 space-y-1.5 text-[12px]">
            {isAptPost ? (
              <>
                <li className="flex justify-between gap-3"><span className="text-white/80">1~20자</span><span className="font-bold tabular-nums">+0</span></li>
                <li className="flex justify-between gap-3"><span className="text-white/80">21~99자 (2~4줄)</span><span className="font-bold tabular-nums text-cyan">+2</span></li>
                <li className="flex justify-between gap-3"><span className="text-white/80">100~199자 (5~9줄)</span><span className="font-bold tabular-nums text-cyan">+3</span></li>
                <li className="flex justify-between gap-3"><span className="text-white/80">200자+ (10줄+)</span><span className="font-bold tabular-nums text-cyan">+5</span></li>
                <li className="border-t border-white/15 pt-2 mt-2 flex justify-between gap-3 text-[11px]"><span className="text-white/60">댓글</span><span className="text-white/60 tabular-nums">+1</span></li>
              </>
            ) : isComment ? (
              <>
                <li className="flex justify-between gap-3"><span className="text-white/80">댓글 (어디든)</span><span className="font-bold tabular-nums text-cyan">+1</span></li>
                <li className="border-t border-white/15 pt-2 mt-2 flex justify-between gap-3 text-[11px]"><span className="text-white/60">커뮤·핫딜 글</span><span className="text-white/60 tabular-nums">+2</span></li>
                <li className="flex justify-between gap-3 text-[11px]"><span className="text-white/60">단지 토론 글 (20자+)</span><span className="text-white/60 tabular-nums">+2~5</span></li>
              </>
            ) : (
              <>
                <li className="flex justify-between gap-3"><span className="text-white/80">커뮤·핫딜 글</span><span className="font-bold tabular-nums text-cyan">+2</span></li>
                <li className="flex justify-between gap-3"><span className="text-white/80">단지 토론 글 (20자=1줄)</span><span className="font-bold tabular-nums text-cyan">+2~5</span></li>
                <li className="flex justify-between gap-3"><span className="text-white/80">모든 댓글</span><span className="font-bold tabular-nums text-cyan">+1</span></li>
              </>
            )}
          </ul>
          <div className="px-4 pb-3 text-[10px] text-white/60 leading-relaxed">
            클릭해서 닫기
          </div>
        </div>
      )}
    </span>
  );
}
