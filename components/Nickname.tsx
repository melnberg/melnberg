'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type NicknameInfo = {
  name: string | null;
  link?: string | null;
  isPaid?: boolean;
  isSolo?: boolean;
};

const BADGE_CLS = 'text-[9px] font-bold tracking-wider uppercase bg-cyan text-white px-1 py-px ml-1 align-middle';

type Pos = { top: number; left: number; right: number };

// 트리거 요소 위치 → 화면 좌표 (fixed 기준)
function rectToPos(el: HTMLElement, gap = 6): Pos {
  const r = el.getBoundingClientRect();
  return { top: r.bottom + gap, left: r.left, right: window.innerWidth - r.right };
}

export default function Nickname({
  info,
  className = '',
  fallback = '익명',
}: {
  info: NicknameInfo | null | undefined;
  className?: string;
  fallback?: string;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const [tipPos, setTipPos] = useState<Pos | null>(null);
  const [legendHover, setLegendHover] = useState(false);
  const [legendPos, setLegendPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);

  const tipBtnRef = useRef<HTMLButtonElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!tipOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (tipBtnRef.current?.contains(t)) return;
      setTipOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [tipOpen]);

  const name = info?.name;
  if (!name) return <span className={className}>{fallback}</span>;

  const isPaid = !!info?.isPaid;
  const isSolo = !!info?.isSolo;
  const hasLink = !!info?.link;

  if (!isPaid) return <span className={className}>{name}</span>;

  const linkColor = hasLink ? '#22c55e' : '#d4d4d4';
  const soloColor = '#ec4899';
  const dotStyle: React.CSSProperties = isSolo
    ? { background: `linear-gradient(to right, ${linkColor} 0 50%, ${soloColor} 50% 100%)` }
    : { background: linkColor };

  const dotEl = (
    <span
      ref={dotRef}
      className="relative inline-block ml-1 align-middle"
      onMouseEnter={() => { if (dotRef.current) { setLegendPos(rectToPos(dotRef.current)); setLegendHover(true); } }}
      onMouseLeave={() => setLegendHover(false)}
    >
      <span className="block w-2 h-2 rounded-full" style={dotStyle} aria-label="회원 표시" />
    </span>
  );

  const legendPopup = mounted && legendHover && legendPos && createPortal(
    <div
      className="fixed z-[100] bg-navy text-white text-[10px] leading-relaxed shadow-xl w-[210px] p-3"
      style={{ top: legendPos.top, right: legendPos.right }}
      onMouseEnter={() => setLegendHover(true)}
      onMouseLeave={() => setLegendHover(false)}
    >
      <div className="text-cyan font-bold tracking-wider uppercase text-[9px] mb-2">회원 표시 안내</div>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <span className="block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#22c55e' }} />
          <span>블로그·SNS 등록</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#d4d4d4' }} />
          <span>미등록</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to right, #22c55e 0 50%, #ec4899 50% 100%)' }} />
          <span>등록 + 미혼 솔로</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to right, #d4d4d4 0 50%, #ec4899 50% 100%)' }} />
          <span>미등록 + 미혼 솔로</span>
        </li>
      </ul>
      <div className="mt-2.5 pt-2 border-t border-white/20 text-[9px] text-white/70 leading-snug">
        마이페이지에서 내 표시를 수정할 수 있습니다.
      </div>
    </div>,
    document.body,
  );

  const inner = (
    <>
      <span>{name}</span>
      <span className={BADGE_CLS}>조합원</span>
      {dotEl}
      {legendPopup}
    </>
  );

  // 링크 있음 → 새 탭으로 직행
  if (hasLink && info?.link) {
    return (
      <a
        href={info.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center hover:underline cursor-pointer whitespace-nowrap ${className}`}
      >
        {inner}
      </a>
    );
  }

  // 링크 없음 → 클릭 시 안내 팝업 + 마이페이지 유도
  function toggleTip(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!tipOpen && tipBtnRef.current) setTipPos(rectToPos(tipBtnRef.current));
    setTipOpen((v) => !v);
  }

  const tipPopup = mounted && tipOpen && tipPos && createPortal(
    <div
      className="fixed z-[100] bg-white border border-border shadow-[0_4px_16px_rgba(0,0,0,0.18)] w-[220px] p-3"
      style={{ top: tipPos.top, right: tipPos.right }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="text-[12px] text-text leading-snug mb-2">
        <b className="text-navy">{name}</b> 님은 아직 블로그·SNS를 등록하지 않았어요.
      </div>
      <Link
        href="/me"
        onClick={() => setTipOpen(false)}
        className="block w-full text-center bg-navy text-white py-1.5 px-3 text-[11px] font-bold no-underline hover:bg-navy-dark"
      >
        내 블로그 등록하기 →
      </Link>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={tipBtnRef}
        type="button"
        onClick={toggleTip}
        className={`inline-flex items-center hover:underline cursor-pointer bg-transparent border-none p-0 m-0 whitespace-nowrap ${className}`}
        style={{ font: 'inherit', color: 'inherit' }}
      >
        {inner}
      </button>
      {tipPopup}
    </>
  );
}
