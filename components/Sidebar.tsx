'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { products } from '@/lib/products';
import NotificationsBell from './NotificationsBell';
import CheckinButton from './CheckinButton';
import { KidsIcon as SharedKidsIcon, RestaurantIcon as SharedRestaurantIcon } from './CategoryIcons';

export type SidebarUser = { name: string; email: string; balance?: number; isPaid?: boolean; isAdmin?: boolean; avatarUrl?: string | null };
export type SidebarRecentPost = { id: number; title: string; created_at: string; author_name: string | null };

type Props = { current?: string; user?: SidebarUser | null; recentPosts?: SidebarRecentPost[] };

const consults = products.filter((p) => p.id === 'short-consult' || p.id === 'mid-consult');
const memberships = products.filter((p) => p.id === 'new-membership' || p.id === 'renewal');

// 메뉴 정의 — 레일과 드로어가 공유
type MenuItem = { href: string; label: string; current: string; icon: React.ReactNode };
const TOP_MENU: MenuItem[] = [
  { href: '/', label: '홈', current: 'home', icon: <HomeIcon /> },
  { href: '/ai', label: '멜른버그 AI', current: 'ai', icon: <AiIcon /> },
];
const BOTTOM_MENU: MenuItem[] = [
  { href: '/restaurants', label: '맛집 추천', current: 'restaurants', icon: <RestaurantIcon /> },
  { href: '/kids', label: '육아 장소', current: 'kids', icon: <KidsIcon /> },
  { href: '/ranking', label: '자산 순위', current: 'ranking', icon: <RankingIcon /> },
  { href: '/hotdeal', label: '핫딜', current: 'hotdeal', icon: <HotdealIcon /> },
  { href: '/community', label: '커뮤니티', current: 'community', icon: <CommunityIcon /> },
];

export default function Sidebar({ current, user, recentPosts = [] }: Props) {
  const [open, setOpen] = useState(false);            // 모바일 드로어 열림
  const [pcHovered, setPcHovered] = useState(false);  // PC 드로어 hover 상태

  const isConsultActive = consults.some((p) => current === p.filename);
  const isMembershipActive = memberships.some((p) => current === p.filename);
  const [consultOpen, setConsultOpen] = useState(isConsultActive);
  const [membershipOpen, setMembershipOpen] = useState(isMembershipActive);
  const memOpen = membershipOpen || consultOpen;
  const memActive = isMembershipActive || isConsultActive;

  useEffect(() => {
    const close = () => setOpen(false);
    if (open && window.innerWidth <= 780) {
      window.addEventListener('resize', close);
      return () => window.removeEventListener('resize', close);
    }
  }, [open]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    if (open && isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  useEffect(() => { if (isConsultActive) setConsultOpen(true); }, [isConsultActive]);
  useEffect(() => { if (isMembershipActive) setMembershipOpen(true); }, [isMembershipActive]);

  // 메뉴 아이템들의 콘텐츠 (드로어 + 모바일 공통)
  const menuContent = (
    <>
      {TOP_MENU.map((m) => (
        <SItem key={m.href} {...m} active={current === m.current} onClick={() => setOpen(false)} />
      ))}
      <SectionToggle
        label="멤버십"
        icon={<MembershipIcon />}
        open={memOpen}
        onClick={() => { const next = !memOpen; setMembershipOpen(next); setConsultOpen(next); }}
      />
      {memOpen && (
        <>
          {memberships.map((p) => (
            <SItem key={p.id} href={`/pay/${p.id}`} label={p.id === 'new-membership' ? '2분기 신규가입' : '2분기 갱신'}
              active={current === p.filename} icon={p.id === 'new-membership' ? <StarIcon /> : <RenewIcon />}
              onClick={() => setOpen(false)} sub />
          ))}
          {consults.map((p) => (
            <SItem key={p.id} href={`/pay/${p.id}`} label={p.name}
              active={current === p.filename} icon={p.id === 'short-consult' ? <ChatShortIcon /> : <ChatLongIcon />}
              onClick={() => setOpen(false)} sub />
          ))}
        </>
      )}
      {BOTTOM_MENU.map((m) => (
        <SItem key={m.href} {...m} active={current === m.current} onClick={() => setOpen(false)} />
      ))}
      {recentPosts.length > 0 && (
        <ul className="bg-[#fafafa]">
          {recentPosts.map((p) => (
            <li key={p.id} className="border-b border-[#ececec] last:border-b-0">
              <Link href={`/community/${p.id}`} onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 pl-12 pr-4 py-1.5 text-[12px] text-text hover:text-navy hover:bg-navy-soft no-underline"
                title={`${p.id} · ${p.title}${p.author_name ? ` · ${p.author_name}` : ''}`}>
                <span className="text-muted tabular-nums flex-shrink-0">{p.id}</span>
                <span className="inline-block w-px h-3 bg-border flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate">{p.title}</span>
                {p.author_name && <span className="text-cyan font-bold flex-shrink-0 max-w-[60px] truncate">{p.author_name}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  // 사용자 박스 (드로어 + 모바일 공통)
  const userBox = user ? (
    <div className="border border-border hover:border-navy transition-colors">
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5">
        <Link href="/me" onClick={() => setOpen(false)} className="flex-1 min-w-0 flex items-center gap-2.5 no-underline">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-border" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
              {(user.name[0] ?? '').toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-text truncate">{user.name}</span>
            {user.isPaid ? (
              <span className="text-[9px] font-bold tracking-wider uppercase bg-cyan text-white px-1.5 py-0.5 flex-shrink-0">조합원</span>
            ) : (
              <span className="text-[9px] font-bold tracking-wider uppercase bg-[#e5e5e5] text-muted px-1.5 py-0.5 flex-shrink-0">무료</span>
            )}
          </div>
        </Link>
        <NotificationsBell />
      </div>
      <Link href="/me" onClick={() => setOpen(false)}
        className="flex items-center justify-between gap-2 px-3 pb-2 pt-0.5 text-[11px] no-underline border-t border-[#f3f3f3] mx-3">
        {typeof user.balance === 'number' ? (
          <span className="text-cyan font-bold tabular-nums">💰 {user.balance} mlbg</span>
        ) : <span />}
        <span className="text-muted hover:text-navy">마이페이지 →</span>
      </Link>
      <div className="px-3 pb-2 pt-1"><CheckinButton /></div>
      {user.isAdmin && (
        <Link href="/admin" onClick={() => setOpen(false)}
          className="block bg-navy text-white text-center py-1.5 text-[11px] font-bold tracking-widest uppercase no-underline hover:bg-navy-dark">
          어드민 페이지 →
        </Link>
      )}
    </div>
  ) : (
    <div className="flex gap-2">
      <Link href="/login" onClick={() => setOpen(false)}
        className="flex-1 flex items-center justify-center bg-white border border-border text-text py-2.5 px-3 text-[12px] font-bold tracking-wide no-underline hover:border-navy hover:text-navy transition-colors">
        로그인
      </Link>
      <Link href="/signup" onClick={() => setOpen(false)}
        className="flex-1 flex items-center justify-center bg-navy text-white py-2.5 px-3 text-[12px] font-bold tracking-wide no-underline hover:bg-navy-dark transition-colors">
        회원가입
      </Link>
    </div>
  );

  // PC 레일 아이템 — 아이콘만
  const railItems: MenuItem[] = [
    ...TOP_MENU,
    { href: memOpen ? '#' : '/pay/new-membership', label: '멤버십', current: 'membership', icon: <MembershipIcon /> },
    ...BOTTOM_MENU,
  ];

  return (
    <>
      {/* ─── PC: 레일 (항상 60px) ──────────────────────── */}
      <aside
        className="hidden lg:flex fixed top-0 left-0 z-[60] w-[60px] h-screen bg-white border-r border-border flex-col items-center py-3 gap-0.5"
        onMouseEnter={() => setPcHovered(true)}
      >
        <a href="/" className="w-10 h-10 flex items-center justify-center mb-2">
          <img src="/logo.svg" alt="멜른버그" className="w-7 h-7" />
        </a>
        {railItems.map((m) => {
          const isActive = m.current === current || (m.current === 'membership' && memActive);
          return (
            <Link
              key={m.current}
              href={m.href}
              title={m.label}
              className={`w-11 h-11 flex items-center justify-center transition-colors no-underline ${isActive ? 'text-navy bg-navy-soft border-l-[3px] border-navy' : 'text-muted hover:text-navy hover:bg-navy-soft border-l-[3px] border-transparent'}`}
            >
              {m.icon}
            </Link>
          );
        })}
      </aside>

      {/* ─── PC: 드로어 (220px, hover 시 슬라이드) ──────── */}
      <aside
        className={`hidden lg:flex fixed top-0 left-[60px] z-[55] w-[240px] h-screen bg-white border-r border-border flex-col transition-transform duration-200 ${pcHovered ? 'translate-x-0 shadow-[8px_0_24px_rgba(0,0,0,0.10)]' : '-translate-x-[calc(100%+60px)]'}`}
        onMouseEnter={() => setPcHovered(true)}
        onMouseLeave={() => setPcHovered(false)}
      >
        <div
          style={{ overscrollBehavior: 'contain' }}
          className="flex-1 flex flex-col overflow-y-auto"
        >
          <div className="px-5 py-4 border-b border-border">
            <span className="text-[15px] font-bold text-navy tracking-tight">멜른버그</span>
          </div>
          <div className="px-4 pt-3 pb-2">{userBox}</div>
          <nav className="flex-1 py-1 pb-4 flex flex-col">
            <div className="px-5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">메뉴</div>
            {menuContent}
          </nav>
        </div>
      </aside>

      {/* ─── Mobile: 기존 드로어 (280px, 햄버거 클릭 시 열림) ─── */}
      <aside
        style={{ overscrollBehavior: 'contain' }}
        className={`lg:hidden fixed top-0 left-0 z-50 w-[280px] h-screen bg-white border-r border-border flex flex-col overflow-y-auto transition-transform duration-200 ${open ? 'translate-x-0 shadow-[4px_0_16px_rgba(0,0,0,0.08)]' : '-translate-x-full'}`}
      >
        <div className="px-6 py-5 flex items-center border-b border-border">
          <a href="/" className="flex items-center gap-2 no-underline" onClick={() => setOpen(false)}>
            <img src="/logo.svg" alt="멜른버그" className="w-9 h-9 flex-shrink-0" />
            <span className="text-[17px] font-bold text-navy tracking-tight">멜른버그</span>
          </a>
        </div>
        <div className="px-5 pt-4 pb-2">{userBox}</div>
        <nav className="flex-1 py-1 pb-4 flex flex-col">
          <div className="px-6 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">메뉴</div>
          {menuContent}
        </nav>
      </aside>

      {/* 모바일 드로어 backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* 모바일 햄버거 */}
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

function SItem({ href, label, price, active, icon, onClick, sub }: { href: string; label: string; price?: string; active?: boolean; icon: React.ReactNode; onClick?: () => void; sub?: boolean }) {
  const padX = sub ? 'pl-12 pr-6' : 'px-6';
  const subBg = sub ? 'bg-[#fafafa]' : '';
  const activeBg = active ? 'bg-navy-soft text-navy font-bold border-navy' : `text-text font-medium border-transparent hover:bg-navy-soft ${subBg}`;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 ${padX} py-2 text-sm no-underline relative border-l-[3px] border-b border-b-[#f0f0f0] transition-colors ${activeBg}`}
    >
      {icon}
      <span>{label}</span>
      {price && <span className={`ml-auto text-[11px] font-semibold ${active ? 'text-navy' : 'text-muted'}`}>{price}</span>}
      {active && <span className="absolute right-5 text-lg leading-none text-navy">›</span>}
    </Link>
  );
}

function SectionToggle({ label, icon, open, onClick }: { label: string; icon: React.ReactNode; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full px-6 py-2 text-sm font-medium text-text no-underline relative border-l-[3px] border-transparent border-b border-b-[#f0f0f0] hover:bg-navy-soft transition-colors"
      aria-expanded={open}
    >
      {icon}
      <span>{label}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className={`ml-auto text-muted transition-transform ${open ? 'rotate-180' : ''}`}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

const iconCls = 'w-[18px] h-[18px] flex-shrink-0';
const iconProps = { fill: 'none' as const, stroke: 'currentColor' as const, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', className: iconCls };

function HomeIcon() { return <svg {...iconProps}><path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" /></svg>; }
function CommunityIcon() { return <svg {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function HotdealIcon() { return <svg {...iconProps}><path d="M12 2c0 4-3 5-3 9a3 3 0 1 0 6 0c0-2-1-3-1-3 0 0 4 1 4 6a6 6 0 1 1-12 0c0-5 6-7 6-12z" /></svg>; }
function ChatShortIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>; }
function ChatLongIcon() { return <svg {...iconProps}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>; }
function StarIcon() { return <svg {...iconProps}><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg>; }
function RenewIcon() { return <svg {...iconProps}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>; }
function RestaurantIcon() { return <SharedRestaurantIcon className={iconCls} />; }
function KidsIcon() { return <SharedKidsIcon className={iconCls} />; }
function MembershipIcon() { return <svg {...iconProps}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="15" x2="10" y2="15" /></svg>; }
function RankingIcon() { return <svg {...iconProps}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M7 4H4v3a3 3 0 0 0 3 3" /><path d="M17 4h3v3a3 3 0 0 1-3 3" /></svg>; }
function AiIcon() { return <svg {...iconProps} viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>; }
