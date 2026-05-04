'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export type NicknameInfo = {
  name: string | null;
  link?: string | null;
  isPaid?: boolean;
  isSolo?: boolean;
};

const BADGE_CLS = 'text-[9px] font-bold tracking-wider uppercase bg-cyan text-white px-1 py-px ml-1 align-middle';

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
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!tipOpen) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setTipOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [tipOpen]);

  const name = info?.name;
  if (!name) return <span className={className}>{fallback}</span>;

  const isPaid = !!info?.isPaid;
  const isSolo = !!info?.isSolo;
  const hasLink = !!info?.link;
  const nameCls = isSolo ? 'text-pink-500' : '';
  const dotTitle = hasLink ? '블로그·SNS 등록됨 — 클릭 시 새 탭에서 열림' : '블로그·SNS 미등록 — 클릭 시 등록 안내';
  const inner = (
    <>
      <span className={nameCls}>{name}</span>
      {isPaid && <span className={BADGE_CLS}>조합원</span>}
      <span
        className={`inline-block w-2 h-2 rounded-full ml-1 align-middle ${hasLink ? 'bg-green-500' : 'bg-[#d4d4d4]'}`}
        title={dotTitle}
        aria-label={dotTitle}
      />
    </>
  );

  // 링크 있음 → 새 탭으로 직행
  if (info?.link) {
    return (
      <a
        href={info.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`hover:underline cursor-pointer ${className}`}
      >
        {inner}
      </a>
    );
  }

  // 링크 없음 → 클릭 시 작은 안내 팝업 + '내 블로그 등록하기' 유도
  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setTipOpen((v) => !v); }}
        className={`hover:underline cursor-pointer bg-transparent border-none p-0 m-0 inline ${className}`}
        style={{ font: 'inherit', color: 'inherit' }}
      >
        {inner}
      </button>
      {tipOpen && (
        <div className="absolute z-[60] right-0 top-full mt-1 bg-white border border-border shadow-[0_4px_16px_rgba(0,0,0,0.12)] w-[220px] p-3"
          onClick={(e) => e.stopPropagation()}>
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
        </div>
      )}
    </span>
  );
}
