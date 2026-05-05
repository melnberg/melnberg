'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { products } from '@/lib/products';
import NotificationsBell from './NotificationsBell';
import CheckinButton from './CheckinButton';

export type SidebarUser = { name: string; email: string; balance?: number; isPaid?: boolean; isAdmin?: boolean; avatarUrl?: string | null };
export type SidebarRecentPost = { id: number; title: string; created_at: string; author_name: string | null };

type Props = { current?: string; user?: SidebarUser | null; recentPosts?: SidebarRecentPost[] };

const consults = products.filter((p) => p.id === 'short-consult' || p.id === 'mid-consult');
const memberships = products.filter((p) => p.id === 'new-membership' || p.id === 'renewal');

export default function Sidebar({ current, user, recentPosts = [] }: Props) {
  const [open, setOpen] = useState(false);

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

  // current 가 해당 섹션 아이템으로 바뀌면 자동으로 펼침 (네비게이션 후 하위메뉴 유지)
  useEffect(() => { if (isConsultActive) setConsultOpen(true); }, [isConsultActive]);
  useEffect(() => { if (isMembershipActive) setMembershipOpen(true); }, [isMembershipActive]);

  return (
    <>
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 w-[280px] lg:w-[260px] h-screen flex-shrink-0 bg-white border-r border-border flex flex-col overflow-y-auto transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${open ? 'shadow-[4px_0_16px_rgba(0,0,0,0.08)]' : ''}`}
      >
        <div className="px-6 py-5 flex items-center border-b border-border">
          <a href="/" className="flex items-center gap-2 no-underline" onClick={() => setOpen(false)}>
            <img src="/logo.svg" alt="멜른버그" className="w-9 h-9 flex-shrink-0" />
            <span className="text-[17px] font-bold text-navy tracking-tight">멜른버그</span>
          </a>
        </div>

        <div className="px-5 pt-4 pb-2">
          {user ? (
            <div className="border border-border hover:border-navy transition-colors">
              {/* Row 1: 아바타 · 이름 + 배지 · 알림 종 */}
              <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5">
                <Link
                  href="/me"
                  onClick={() => setOpen(false)}
                  className="flex-1 min-w-0 flex items-center gap-2.5 no-underline"
                >
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
              {/* Row 2: mlbg 잔액 · 마이페이지 링크 */}
              <Link
                href="/me"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 px-3 pb-2 pt-0.5 text-[11px] no-underline border-t border-[#f3f3f3] mx-3"
              >
                {typeof user.balance === 'number' ? (
                  <span className="text-cyan font-bold tabular-nums">💰 {user.balance} mlbg</span>
                ) : <span />}
                <span className="text-muted hover:text-navy">마이페이지 →</span>
              </Link>
              {/* 출석 체크 — 박스 안 하단 */}
              <div className="px-3 pb-2 pt-1">
                <CheckinButton />
              </div>
              {/* 어드민 진입 — admin 만 노출 */}
              {user.isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="block bg-navy text-white text-center py-1.5 text-[11px] font-bold tracking-widest uppercase no-underline hover:bg-navy-dark"
                >
                  어드민 페이지 →
                </Link>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex-1 flex items-center justify-center bg-white border border-border text-text py-2.5 px-3 text-[12px] font-bold tracking-wide no-underline hover:border-navy hover:text-navy transition-colors"
              >
                로그인
              </Link>
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="flex-1 flex items-center justify-center bg-navy text-white py-2.5 px-3 text-[12px] font-bold tracking-wide no-underline hover:bg-navy-dark transition-colors"
              >
                회원가입
              </Link>
            </div>
          )}
        </div>

        <nav className="flex-1 py-1 pb-4 flex flex-col">
          <div className="px-6 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">메뉴</div>
          <SItem href="/" label="홈" active={current === 'home'} icon={<HomeIcon />} onClick={() => setOpen(false)} />
          <SItem href="/ai" label="멜른버그 AI" active={current === 'ai'} icon={<AiIcon />} onClick={() => setOpen(false)} />
          <SItem href="/blog" label="블로그" active={current === 'blog'} icon={<BlogIcon />} onClick={() => setOpen(false)} />

          <SectionToggle
            label="상담"
            icon={<ConsultIcon />}
            open={consultOpen}
            onClick={() => setConsultOpen((v) => !v)}
          />
          {consultOpen && consults.map((p) => (
            <SItem
              key={p.id}
              href={`/pay/${p.id}`}
              label={p.name}
              price={p.price.toLocaleString('en-US')}
              active={current === p.filename}
              icon={p.id === 'short-consult' ? <ChatShortIcon /> : <ChatLongIcon />}
              onClick={() => setOpen(false)}
              sub
            />
          ))}

          <SectionToggle
            label="멤버십"
            icon={<MembershipIcon />}
            open={membershipOpen}
            onClick={() => setMembershipOpen((v) => !v)}
          />
          {membershipOpen && memberships.map((p) => (
            <SItem
              key={p.id}
              href={`/pay/${p.id}`}
              label={p.id === 'new-membership' ? '2분기 신규가입' : '2분기 갱신'}
              price={p.price.toLocaleString('en-US')}
              active={current === p.filename}
              icon={p.id === 'new-membership' ? <StarIcon /> : <RenewIcon />}
              onClick={() => setOpen(false)}
              sub
            />
          ))}

          {/* 시한 경매 */}
          <SItem href="/auctions" label="시한 경매" active={current === 'auctions'} icon={<AuctionIcon />} onClick={() => setOpen(false)} />

          {/* 핫딜 게시판 — 적립 보상 2.5x */}
          <SItem href="/hotdeal" label="핫딜" active={current === 'hotdeal'} icon={<HotdealIcon />} onClick={() => setOpen(false)} />

          {/* 커뮤니티 — 메뉴 맨 아래 + 최신글 미리보기 */}
          <SItem href="/community" label="커뮤니티" active={current === 'community'} icon={<CommunityIcon />} onClick={() => setOpen(false)} />
          {recentPosts.length > 0 && (
            <ul className="bg-[#fafafa]">
              {recentPosts.map((p) => (
                <li key={p.id} className="border-b border-[#ececec] last:border-b-0">
                  <Link
                    href={`/community/${p.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-1.5 pl-12 pr-4 py-2 text-[12px] text-text hover:text-navy hover:bg-navy-soft no-underline"
                    title={`${p.id} · ${p.title}${p.author_name ? ` · ${p.author_name}` : ''}`}
                  >
                    <span className="text-muted tabular-nums flex-shrink-0">{p.id}</span>
                    <span className="inline-block w-px h-3 bg-border flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{p.title}</span>
                    {p.author_name && (
                      <span className="text-cyan font-bold flex-shrink-0 max-w-[60px] truncate">{p.author_name}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>

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
              <Link href="/blog" className="flex-1 text-center text-[11px] text-muted no-underline py-1 hover:text-navy border-l border-border">블로그</Link>
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
        className="lg:hidden fixed top-2 left-2 z-30 w-10 h-10 bg-transparent text-navy flex items-center justify-center border-none p-0"
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
      className={`flex items-center gap-3 ${padX} py-3 text-sm no-underline relative border-l-[3px] border-b border-b-[#f0f0f0] transition-colors ${activeBg}`}
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
      className="flex items-center gap-3 w-full px-6 py-3 text-sm font-medium text-text no-underline relative border-l-[3px] border-transparent border-b border-b-[#f0f0f0] hover:bg-navy-soft transition-colors"
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
const AuctionIcon = () => <svg {...iconProps}><path d="M11 21h-1l1-7" /><path d="M14 3h1l-1 7" /><path d="M5 14l9-9" /><path d="M3 16l5 5" /><path d="M16 8l5 5" /></svg>;
const ApartmentIcon = () => <svg {...iconProps}><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></svg>;
const ChatShortIcon = () => <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
const ChatLongIcon = () => <svg {...iconProps}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>;
const StarIcon = () => <svg {...iconProps}><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg>;
const RenewIcon = () => <svg {...iconProps}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>;
const ConsultIcon = () => <svg {...iconProps}><path d="M3 18v-7a9 9 0 0 1 18 0v7" /><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4z" /><path d="M3 19a2 2 0 0 0 2 2h1v-6H3v4z" /></svg>;
const MembershipIcon = () => <svg {...iconProps}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="15" x2="10" y2="15" /></svg>;

const AiIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
