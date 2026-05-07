'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { products } from '@/lib/products';
import NotificationsBell from './NotificationsBell';
import CheckinButton from './CheckinButton';
import { KidsIcon as SharedKidsIcon, RestaurantIcon as SharedRestaurantIcon } from './CategoryIcons';

export type SidebarUser = { name: string; email: string; balance?: number; isPaid?: boolean; isAdmin?: boolean; avatarUrl?: string | null };
export type SidebarRecentPost = { id: number; title: string; created_at: string; author_name: string | null };
export type BoardKey = 'community' | 'realty' | 'stocks' | 'restaurants' | 'kids';
export type BoardLatest = { community: string | null; realty: string | null; stocks: string | null; restaurants: string | null; kids: string | null };

type Props = { current?: string; user?: SidebarUser | null; recentPosts?: SidebarRecentPost[]; boardLatest?: BoardLatest };

const BOARD_KEYS: BoardKey[] = ['community', 'realty', 'stocks', 'restaurants', 'kids'];
const LS_KEY = (b: BoardKey) => `last_read.${b}`;

const consults = products.filter((p) => p.id === 'short-consult' || p.id === 'mid-consult');
const memberships = products.filter((p) => p.id === 'new-membership' || p.id === 'renewal');

export default function Sidebar({ current, user, recentPosts = [], boardLatest }: Props) {
  const [open, setOpen] = useState(false);

  // 새 글 빨간점 — localStorage 기반 디바이스별 last_read 관리.
  // 서버 boardLatest 와 lastRead 비교해서 dot 여부 결정.
  const [lastRead, setLastRead] = useState<Record<string, string | null>>({});

  // mount 시 5개 키 한번에 읽기.
  useEffect(() => {
    try {
      const next: Record<string, string | null> = {};
      for (const b of BOARD_KEYS) {
        next[b] = localStorage.getItem(LS_KEY(b));
      }
      setLastRead(next);
    } catch { /* localStorage 차단 환경 — dot 정상 표시 */ }
  }, []);

  // current 가 board 키와 일치하면 즉시 last_read 갱신 → dot 사라짐.
  useEffect(() => {
    if (!current) return;
    if (!(BOARD_KEYS as string[]).includes(current)) return;
    const now = new Date().toISOString();
    try { localStorage.setItem(LS_KEY(current as BoardKey), now); } catch { /* ignore */ }
    setLastRead((s) => ({ ...s, [current]: now }));
  }, [current]);

  const dot = (board: BoardKey): boolean => {
    const latest = boardLatest?.[board];
    if (!latest) return false;
    const r = lastRead[board];
    if (!r) return true;
    return new Date(latest).getTime() > new Date(r).getTime();
  };

  // 현재 페이지가 해당 섹션의 아이템이면 자동 펼침. 이외엔 닫힘 상태로 시작.
  const isConsultActive = consults.some((p) => current === p.filename);
  const isMembershipActive = memberships.some((p) => current === p.filename);
  const [consultOpen, setConsultOpen] = useState(isConsultActive);
  const [membershipOpen, setMembershipOpen] = useState(isMembershipActive);

  useEffect(() => {
    const close = () => setOpen(false);
    if (open && window.innerWidth <= 780) {
      window.addEventListener('resize', close);
      return () => window.removeEventListener('resize', close);
    }
  }, [open]);

  // 모바일 사이드바 열린 상태에서 body 스크롤 잠금. 사이드바 안 스크롤만 동작하게.
  // overscroll-behavior 만으로는 body 가 같이 움직이는 문제 방지 안 됨 → body overflow:hidden 강제.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    if (open && isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // current 가 해당 섹션 아이템으로 바뀌면 자동으로 펼침 (네비게이션 후 하위메뉴 유지)
  useEffect(() => { if (isConsultActive) setConsultOpen(true); }, [isConsultActive]);
  useEffect(() => { if (isMembershipActive) setMembershipOpen(true); }, [isMembershipActive]);

  return (
    <>
      <aside
        style={{ overscrollBehavior: 'contain' }}
        // 모바일 100vh 함정 회피 — h-[100dvh] 는 URL바·제스처바 노출 시 줄어들어 하단 [로그인][회원가입] 가 시스템UI 뒤로 숨지 않음.
        className={`fixed lg:sticky top-0 left-0 z-50 w-[280px] lg:w-[170px] h-[100dvh] lg:h-screen flex-shrink-0 bg-white border-r border-border flex flex-col overflow-y-auto transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${open ? 'shadow-[4px_0_16px_rgba(0,0,0,0.08)]' : ''}`}
      >
        <div className="px-4 flex items-center h-[66px]">
          <a href="/" className="flex items-center gap-2 no-underline" onClick={() => setOpen(false)}>
            <img src="/logo.svg" alt="멜른버그" className="w-9 h-9 flex-shrink-0" />
            <span className="text-[14px] font-bold text-navy tracking-tight whitespace-nowrap">멜른버그</span>
          </a>
        </div>

        {/* 로그인 사용자 정보 — 좁은 사이드바 (lg:140px) 에서도 안 깨지게 세로 스택.
            순서: 사진+조합원 / 자산(mlbg) / 마이페이지 / 출석룰렛 / 어드민. */}
        {user && (
          <div className="px-3 py-2">
            <div className="border border-border hover:border-navy transition-colors p-2.5 flex flex-col gap-2 relative">
              {/* 알림 종 — 카드 우상단 absolute */}
              <div className="absolute top-1.5 right-1.5">
                <NotificationsBell />
              </div>
              {/* 1. 사진 + 조합원/무료 뱃지 + 닉네임 (세로 스택, 가운데 정렬) */}
              <Link
                href="/me"
                onClick={() => setOpen(false)}
                className="flex flex-col items-center gap-1 no-underline"
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-navy text-white flex items-center justify-center text-base font-bold">
                    {(user.name[0] ?? '').toUpperCase()}
                  </div>
                )}
                {user.isPaid ? (
                  <span className="text-[9px] font-bold tracking-wider uppercase bg-cyan text-white px-1.5 py-0.5">조합원</span>
                ) : (
                  <span className="text-[9px] font-bold tracking-wider uppercase bg-[#e5e5e5] text-muted px-1.5 py-0.5">무료</span>
                )}
                <span className="text-[12px] font-bold text-text truncate max-w-full">{user.name}</span>
              </Link>
              {/* 2. 자산 — mlbg 잔액 가운데 */}
              {typeof user.balance === 'number' && (
                <Link
                  href="/me"
                  onClick={() => setOpen(false)}
                  className="text-center text-[12px] text-cyan font-bold tabular-nums no-underline border-t border-[#f3f3f3] pt-1.5"
                >
                  💰 {user.balance} mlbg
                </Link>
              )}
              {/* 3. 마이페이지 링크 */}
              <Link
                href="/me"
                onClick={() => setOpen(false)}
                className="text-center text-[11px] text-muted hover:text-navy no-underline"
              >
                마이페이지 →
              </Link>
              {/* 4. 출석 룰렛 */}
              <CheckinButton />
              {/* 5. 어드민 페이지 (관리자만) */}
              {user.isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="block bg-navy text-white text-center py-1.5 text-[10px] font-bold tracking-widest uppercase no-underline hover:bg-navy-dark"
                >
                  어드민 →
                </Link>
              )}
            </div>
          </div>
        )}

        <nav className="flex-1 pb-4 flex flex-col mt-3">
          {/* 사용자 지정 순서: 홈 / AI / 커뮤니티 / 부동산 토론 / 주식 토론 / 맛집 추천 / 육아 장소 / 멤버십 */}
          <SItem href="/" label="홈" active={current === 'home'} icon={<HomeIcon />} onClick={() => setOpen(false)} />
          <SItem href="/ai" label="멜른버그 AI" active={current === 'ai'} icon={<AiIcon />} onClick={() => setOpen(false)} />
          <SItem href="/community" label="커뮤니티" active={current === 'community'} icon={<CommunityIcon />} onClick={() => setOpen(false)} dot={dot('community')} />
          <SItem href="/realty" label="부동산 토론" active={current === 'realty'} icon={<RealtyIcon />} onClick={() => setOpen(false)} dot={dot('realty')} />
          <SItem href="/stocks" label="주식 토론" active={current === 'stocks'} icon={<StocksIcon />} onClick={() => setOpen(false)} dot={dot('stocks')} />
          <SItem href="/restaurants" label="맛집 추천" active={current === 'restaurants'} icon={<RestaurantIcon />} onClick={() => setOpen(false)} dot={dot('restaurants')} />
          <SItem href="/kids" label="육아 장소" active={current === 'kids'} icon={<KidsIcon />} onClick={() => setOpen(false)} dot={dot('kids')} />

          {/* 멤버십 — 상담 2개 + 멤버십 2개 모두 하위 */}
          <SectionToggle
            label="멤버십"
            icon={<MembershipIcon />}
            open={membershipOpen || consultOpen}
            onClick={() => { const next = !(membershipOpen || consultOpen); setMembershipOpen(next); setConsultOpen(next); }}
          />
          {(membershipOpen || consultOpen) && (
            <>
              {memberships.map((p) => (
                <SItem
                  key={p.id}
                  href={`/pay/${p.id}`}
                  label={p.id === 'new-membership' ? '2분기 신규가입' : '2분기 갱신'}
                  active={current === p.filename}
                  icon={p.id === 'new-membership' ? <StarIcon /> : <RenewIcon />}
                  onClick={() => setOpen(false)}
                  sub
                />
              ))}
              {consults.map((p) => (
                <SItem
                  key={p.id}
                  href={`/pay/${p.id}`}
                  label={p.name}
                  active={current === p.filename}
                  icon={p.id === 'short-consult' ? <ChatShortIcon /> : <ChatLongIcon />}
                  onClick={() => setOpen(false)}
                  sub
                />
              ))}
            </>
          )}

          {/* 가림 메뉴 (블로그 / 시한 경매 / 자산 순위 / 핫딜 / 내 가게) — 페이지 자체는 살아있음, 직접 URL 진입 가능 */}
          {/* <SItem href="/blog" label="블로그" active={current === 'blog'} icon={<BlogIcon />} onClick={() => setOpen(false)} /> */}
          {/* <SItem href="/auctions" label="시한 경매" active={current === 'auctions'} icon={<AuctionIcon />} onClick={() => setOpen(false)} /> */}
          {/* <SItem href="/ranking" label="자산 순위" active={current === 'ranking'} icon={<RankingIcon />} onClick={() => setOpen(false)} /> */}
          {/* <SItem href="/hotdeal" label="핫딜" active={current === 'hotdeal'} icon={<HotdealIcon />} onClick={() => setOpen(false)} /> */}
          {/* <SItem href="/stores" label="내 가게" active={current === 'stores'} icon={<StoreIcon />} onClick={() => setOpen(false)} /> */}
        </nav>

        {/* 비로그인 — 사이드바 맨 아래 [로그인 (흰)] [회원가입 (네이비)] 스택 */}
        {!user && (
          <div className="px-4 pb-4 pt-2 flex flex-col gap-2 border-t border-border">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center bg-white border border-border text-text h-[34px] text-[12px] font-bold tracking-wide no-underline hover:border-navy hover:text-navy transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center bg-navy text-white h-[34px] text-[12px] font-bold tracking-wide no-underline hover:bg-navy-dark transition-colors"
            >
              회원가입
            </Link>
          </div>
        )}

        {/* 사이드바 하단 상담문의(오픈채팅) 섹션 — 임시 숨김. 추후 부활 시 false → true */}
        {false && (
          <div className="border-t border-border px-6 pt-4 pb-3">
            <div className="flex items-start gap-3 pb-3">
              <div className="w-9 h-9 rounded-full bg-navy-soft text-navy flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-[11px] text-muted tracking-wide mb-0.5">상담문의</div>
                <span className="block text-base font-bold text-navy tracking-tight">오픈채팅</span>
                <div className="text-[10px] text-muted mt-1 leading-relaxed">
                  결제 후 비공개 채팅방 안내
                  <br />
                  응답: 24시간 이내
                </div>
              </div>
            </div>
            <div className="flex border-t border-border pt-3">
              <Link href="/" className="flex-1 text-center text-[11px] text-muted no-underline py-1 hover:text-navy">홈</Link>
              {/* 블로그 링크 가림 — Sidebar 상단 메뉴와 동일 처리 */}
            </div>
          </div>
        )}
      </aside>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <button
        type="button"
        aria-label="메뉴 열기"
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-2 left-2 z-40 w-9 h-9 rounded-full bg-white/70 backdrop-blur-sm border border-border text-navy hover:bg-white hover:border-navy flex items-center justify-center p-0"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1={3} y1={6} x2={21} y2={6} />
          <line x1={3} y1={12} x2={21} y2={12} />
          <line x1={3} y1={18} x2={21} y2={18} />
        </svg>
      </button>
    </>
  );
}

function SItem({ href, label, price, active, icon, onClick, sub, dot }: { href: string; label: string; price?: string; active?: boolean; icon: React.ReactNode; onClick?: () => void; sub?: boolean; dot?: boolean }) {
  const padX = sub ? 'pl-9 pr-4' : 'px-4';
  const subBg = sub ? 'bg-[#fafafa]' : '';
  const activeBg = active ? 'bg-navy-soft text-navy font-bold border-navy' : `text-text font-medium border-transparent hover:bg-navy-soft ${subBg}`;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 ${padX} py-2 text-[13px] no-underline relative border-l-[3px] border-b border-b-[#f0f0f0] transition-colors whitespace-nowrap ${activeBg}`}
    >
      {icon}
      <span className="truncate">{label}</span>
      {/* 새 글 빨간점 — active 일 땐 어차피 진입한 직후라 dot 사라짐. price/active arrow 와 충돌 없음. */}
      {dot && !active && <span aria-label="새 글" className="ml-auto w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
      {price && <span className={`ml-auto text-[11px] font-semibold ${active ? 'text-navy' : 'text-muted'}`}>{price}</span>}
      {active && <span className="absolute right-3 text-lg leading-none text-navy">›</span>}
    </Link>
  );
}

function SectionToggle({ label, icon, open, onClick }: { label: string; icon: React.ReactNode; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-4 py-2 text-[13px] font-medium text-text no-underline relative border-l-[3px] border-transparent border-b border-b-[#f0f0f0] hover:bg-navy-soft transition-colors whitespace-nowrap"
      aria-expanded={open}
    >
      {icon}
      <span>{label}</span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`ml-auto text-muted transition-transform ${open ? 'rotate-180' : ''}`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

const iconCls = 'w-[18px] h-[18px] flex-shrink-0';
const iconProps = { fill: 'none' as const, stroke: 'currentColor' as const, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', className: iconCls };

const HomeIcon = () => <svg {...iconProps}><path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" /></svg>;
const BlogIcon = () => <svg {...iconProps}><path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z" /><path d="M4 4v12a4 4 0 0 0 4 4" /></svg>;
const CommunityIcon = () => <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const HotdealIcon = () => <svg {...iconProps}><path d="M12 2c0 4-3 5-3 9a3 3 0 1 0 6 0c0-2-1-3-1-3 0 0 4 1 4 6a6 6 0 1 1-12 0c0-5 6-7 6-12z" /></svg>;
// 차트 (캔들봉 + 추세선) — 주식 토론
const StocksIcon = () => <svg {...iconProps}><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-5" /><path d="M16 9h3v3" /></svg>;
const RealtyIcon = () => <svg {...iconProps}><rect x="3" y="3" width="18" height="18" rx="1" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /></svg>;
// 가게 (지붕 달린 상점) — 내 가게
const StoreIcon = () => <svg {...iconProps}><path d="M3 9l1-5h16l1 5" /><path d="M3 9v11h18V9" /><path d="M9 20v-6h6v6" /></svg>;
const AuctionIcon = () => <svg {...iconProps}><path d="M11 21h-1l1-7" /><path d="M14 3h1l-1 7" /><path d="M5 14l9-9" /><path d="M3 16l5 5" /><path d="M16 8l5 5" /></svg>;
const ApartmentIcon = () => <svg {...iconProps}><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></svg>;
const ChatShortIcon = () => <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
const ChatLongIcon = () => <svg {...iconProps}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>;
const StarIcon = () => <svg {...iconProps}><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg>;
const RenewIcon = () => <svg {...iconProps}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>;
const ConsultIcon = () => <svg {...iconProps}><path d="M3 18v-7a9 9 0 0 1 18 0v7" /><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4z" /><path d="M3 19a2 2 0 0 0 2 2h1v-6H3v4z" /></svg>;
const RestaurantIcon = () => <SharedRestaurantIcon className={iconCls} />;
const KidsIcon = () => <SharedKidsIcon className={iconCls} />;
const MembershipIcon = () => <svg {...iconProps}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="15" x2="10" y2="15" /></svg>;
// 트로피 — 자산 순위
const RankingIcon = () => <svg {...iconProps}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M7 4H4v3a3 3 0 0 0 3 3" /><path d="M17 4h3v3a3 3 0 0 1-3 3" /></svg>;

const AiIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
