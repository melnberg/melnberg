'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';

export type NicknameInfo = {
  name: string | null;
  link?: string | null;
  isPaid?: boolean;
  isSolo?: boolean;
  userId?: string | null;
  avatarUrl?: string | null;
  /** 보유 단지 수 — 0/1/2+ 별 색·라벨로 좌측에 노출. undefined 면 숨김. */
  aptCount?: number | null;
};

type OwnedApt = { id: number; apt_nm: string | null; dong: string | null; listing_price?: number | string | null };

function HousingTag({ n, userId }: { n: number; userId?: string | null }) {
  // 0 = 무주택 (회색), 1 = 1주택 (시안), 2+ = N주택 (네이비)
  const cls = n === 0
    ? 'bg-[#e5e7eb] text-[#6b7280]'
    : n === 1
    ? 'bg-cyan/15 text-cyan'
    : 'bg-navy text-white';
  const label = n === 0 ? '무주택' : `${n}주택`;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [apts, setApts] = useState<OwnedApt[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const tagRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // 무주택이거나 userId 없으면 hover 비활성화 — 단순 라벨
  const interactive = n > 0 && !!userId;

  async function loadApts() {
    if (apts !== null || !userId) return;
    setLoading(true);
    const supabase = createClient();
    // listing_price 는 apt_master 와 별도 테이블 — best-effort 로 join 시도, 실패 시 fallback
    const { data, error } = await supabase
      .from('apt_master_with_listing')
      .select('id, apt_nm, dong, listing_price')
      .eq('occupier_id', userId)
      .order('occupied_at', { ascending: false });
    if (error || !data) {
      // view 없으면 (SQL 060 미실행) plain apt_master 로 재시도
      const { data: fallback } = await supabase
        .from('apt_master')
        .select('id, apt_nm, dong')
        .eq('occupier_id', userId)
        .order('occupied_at', { ascending: false });
      setApts((fallback ?? []) as OwnedApt[]);
    } else {
      setApts(data as OwnedApt[]);
    }
    setLoading(false);
  }

  function handleEnter() {
    if (!interactive) return;
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (tagRef.current) setPos(rectToPos(tagRef.current));
    setOpen(true);
    loadApts();
  }
  function handleLeave() {
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }
  function handlePopupEnter() {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  }

  return (
    <>
      <span
        ref={tagRef}
        className={`text-[9px] font-bold tracking-wider px-1 py-px ml-1 align-middle leading-none ${cls} ${interactive ? 'cursor-pointer' : ''}`}
        title={interactive ? `보유 단지 ${n}개 — 클릭/호버로 목록` : `보유 단지 ${n}개`}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={(e) => { e.stopPropagation(); handleEnter(); }}
      >
        {label}
      </span>
      {interactive && mounted && open && pos && createPortal(
        <div
          className="fixed z-[100] bg-white border border-navy/30 shadow-[0_4px_20px_rgba(0,32,96,0.18)] w-[260px] max-h-[320px] overflow-y-auto"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handleLeave}
        >
          <div className="px-3 py-2 border-b border-border bg-navy text-white text-[11px] font-bold tracking-wider uppercase flex items-center justify-between">
            <span>보유 단지</span>
            <span className="text-cyan tabular-nums">{n}개</span>
          </div>
          {loading ? (
            <div className="px-3 py-4 text-[11px] text-muted text-center">불러오는 중...</div>
          ) : !apts || apts.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-muted text-center">보유 단지 없음</div>
          ) : (
            <ul>
              {apts.map((a) => {
                const lp = a.listing_price == null ? null : Number(a.listing_price);
                return (
                  <li key={a.id} className="border-b border-border last:border-b-0">
                    <Link
                      href={`/?apt=${a.id}`}
                      onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                      className="block px-3 py-2 text-[12px] no-underline hover:bg-navy-soft"
                    >
                      <div className="font-bold text-navy truncate">{a.apt_nm ?? '(이름 없음)'}</div>
                      <div className="flex items-center justify-between text-[10px] text-muted mt-0.5">
                        <span className="truncate">{a.dong ?? ''}</span>
                        {lp != null && (
                          <span className="text-cyan font-bold flex-shrink-0 ml-2">매물 {lp.toLocaleString()} mlbg</span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

const BADGE_CLS = 'text-[9px] font-bold tracking-wider uppercase bg-cyan text-white px-1 py-px align-middle leading-none';

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

  const aptCount = info?.aptCount;
  const housingTag = typeof aptCount === 'number' ? <HousingTag n={aptCount} userId={info?.userId ?? null} /> : null;

  const isPaid = !!info?.isPaid;
  const isSolo = !!info?.isSolo;
  const hasLink = !!info?.link;
  const userId = info?.userId ?? null;
  const avatarUrl = info?.avatarUrl ?? null;
  const avatarNode = avatarUrl ? (
    <img
      src={avatarUrl}
      alt=""
      className="w-4 h-4 rounded-full object-cover mr-1 align-middle inline-block flex-shrink-0 transition-transform duration-150 hover:scale-[3.5] hover:relative hover:z-50 hover:shadow-lg origin-left"
    />
  ) : (
    <span className="w-4 h-4 rounded-full bg-[#d4d4d4] mr-1 align-middle inline-flex items-center justify-center flex-shrink-0 text-white transition-transform duration-150 hover:scale-[3.5] hover:relative hover:z-50 hover:shadow-lg origin-left">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
    </span>
  );

  if (!isPaid) {
    // 무료회원은 그냥 텍스트 (프로필 페이지 X)
    // 무료회원: 사진 / 닉네임 / 주택수 (조합원 배지 없음)
    return <span className={`inline-flex items-center ${className}`}>{avatarNode}{name}{housingTag}</span>;
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

  // 조합원 배지 — 주택수 라벨이 있으면 그 옆에 딱 붙이고, 없으면 이름과 1px 간격
  const badgeMargin = housingTag ? '' : 'ml-1';
  const badgeNode = userId ? (
    <Link
      href={`/u/${userId}`}
      onClick={(e) => e.stopPropagation()}
      className={`${BADGE_CLS} ${badgeMargin} no-underline hover:bg-cyan/80 cursor-pointer`}
    >
      조합원
    </Link>
  ) : (
    <span className={`${BADGE_CLS} ${badgeMargin}`}>조합원</span>
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

  // 표기 순서: 사진 / 닉네임 / 주택수 / 조합원 / SNS dot
  return (
    <span className={`inline-flex items-center whitespace-nowrap ${className}`}>
      {avatarNode}
      {nameNode}
      {housingTag}
      {badgeNode}
      {dotEl}
      {legendPopup}
      {tipPopup}
    </span>
  );
}
