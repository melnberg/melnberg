'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type NicknameInfo = {
  name: string | null;
  link?: string | null;
  isPaid?: boolean;
  isSolo?: boolean;
  userId?: string | null;
  avatarUrl?: string | null;
};

const BADGE_CLS = 'text-[9px] font-bold tracking-wider uppercase bg-cyan text-white px-1 py-px ml-1 align-middle';

// 두 반원으로 깔끔하게 합친 dot. right=null이면 단색.
function SoloDot({ left, right, size = 10 }: { left: string; right: string | null; size?: number }) {
  const half = size / 2;
  if (!right) {
    return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: left, flexShrink: 0 }} />;
  }
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0, lineHeight: 0 }}>
      <span style={{ width: half, height: size, background: left, borderTopLeftRadius: half, borderBottomLeftRadius: half }} />
      <span style={{ width: half, height: size, background: right, borderTopRightRadius: half, borderBottomRightRadius: half }} />
    </span>
  );
}

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
  const userId = info?.userId ?? null;
  const avatarUrl = info?.avatarUrl ?? null;
  const avatarNode = avatarUrl ? (
    <img src={avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover mr-1 align-middle inline-block flex-shrink-0" />
  ) : null;

  if (!isPaid) {
    // 무료회원은 그냥 텍스트 (프로필 페이지 X)
    return <span className={`inline-flex items-center ${className}`}>{avatarNode}{name}</span>;
  }

  const linkColor = hasLink ? '#22c55e' : '#d4d4d4';
  const soloColor = '#ec4899';

  const dotEl = (
    <span
      ref={dotRef}
      className="relative inline-block ml-1 align-middle"
      onMouseEnter={() => { if (dotRef.current) { setLegendPos(rectToPos(dotRef.current)); setLegendHover(true); } }}
      onMouseLeave={() => setLegendHover(false)}
    >
      <SoloDot left={linkColor} right={isSolo ? soloColor : null} size={10} />
    </span>
  );

  const legendPopup = mounted && legendHover && legendPos && createPortal(
    <div
      className="fixed z-[100] bg-navy text-white text-[11px] leading-relaxed shadow-xl w-[240px]"
      style={{ top: legendPos.top, right: legendPos.right }}
      onMouseEnter={() => setLegendHover(true)}
      onMouseLeave={() => setLegendHover(false)}
    >
      <div className="px-4 py-2.5 border-b border-cyan/30 text-cyan font-bold tracking-[0.18em] uppercase text-[10px]">회원 표시 안내</div>
      <ul className="px-4 py-3 space-y-2">
        <li className="flex items-center gap-2.5">
          <SoloDot left="#22c55e" right={null} size={11} />
          <span>블로그·SNS 등록</span>
        </li>
        <li className="flex items-center gap-2.5">
          <SoloDot left="#d4d4d4" right={null} size={11} />
          <span>미등록</span>
        </li>
        <li className="flex items-center gap-2.5">
          <SoloDot left="#22c55e" right="#ec4899" size={11} />
          <span>등록 + 미혼 솔로</span>
        </li>
        <li className="flex items-center gap-2.5">
          <SoloDot left="#d4d4d4" right="#ec4899" size={11} />
          <span>미등록 + 미혼 솔로</span>
        </li>
      </ul>
      <div className="px-4 py-2.5 border-t border-white/15 text-[10px] text-white/70 leading-snug">
        마이페이지에서 내 표시를 수정할 수 있습니다.
      </div>
    </div>,
    document.body,
  );

  // 닉네임 자체 — 링크 있으면 SNS, 없으면 안내 팝업, 그리고 userId 만 있으면 프로필
  const nameNode = (() => {
    if (hasLink && info?.link) {
      return (
        <a
          href={info.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="hover:underline cursor-pointer"
        >
          {name}
        </a>
      );
    }
    // 링크 없음 → 클릭 시 안내 팝업
    return (
      <button
        ref={tipBtnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!tipOpen && tipBtnRef.current) setTipPos(rectToPos(tipBtnRef.current));
          setTipOpen((v) => !v);
        }}
        className="hover:underline cursor-pointer bg-transparent border-none p-0 m-0"
        style={{ font: 'inherit', color: 'inherit' }}
      >
        {name}
      </button>
    );
  })();

  // 조합원 배지 — userId 있으면 프로필 페이지로, 없으면 그냥 표시
  const badgeNode = userId ? (
    <Link
      href={`/u/${userId}`}
      onClick={(e) => e.stopPropagation()}
      className={`${BADGE_CLS} no-underline hover:bg-cyan/80 cursor-pointer`}
    >
      조합원
    </Link>
  ) : (
    <span className={BADGE_CLS}>조합원</span>
  );

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
    <span className={`inline-flex items-center whitespace-nowrap ${className}`}>
      {avatarNode}
      {nameNode}
      {badgeNode}
      {dotEl}
      {legendPopup}
      {tipPopup}
    </span>
  );
}
