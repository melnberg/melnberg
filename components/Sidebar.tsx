'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { products } from '@/lib/products';

export type SidebarUser = { name: string; email: string };

type Props = { current?: string; user?: SidebarUser | null };

const consults = products.filter((p) => p.id === 'short-consult' || p.id === 'mid-consult');
const memberships = products.filter((p) => p.id === 'new-membership' || p.id === 'renewal');

export default function Sidebar({ current, user }: Props) {
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

  return (
    <>
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 w-[280px] lg:w-[260px] h-screen flex-shrink-0 bg-white border-r border-border flex flex-col overflow-y-auto transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${open ? 'shadow-[4px_0_16px_rgba(0,0,0,0.08)]' : ''}`}
      >
        <div className="px-6 py-5 flex items-center justify-between border-b border-border">
          <a href="/" className="flex items-center gap-2 no-underline" onClick={() => setOpen(false)}>
            <img src="/logo.svg" alt="멜른버그" className="w-9 h-9 flex-shrink-0" />
            <span className="text-[17px] font-bold text-navy tracking-tight">멜른버그</span>
          </a>
          <button
            type="button"
            aria-label="검색"
            className="w-8 h-8 rounded-full border border-border bg-white flex items-center justify-center text-navy"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx={11} cy={11} r={7} />
              <line x1={21} y1={21} x2={16.65} y2={16.65} />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-4 pb-2">
          {user ? (
            <Link
              href="/me"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 border border-border no-underline hover:border-navy transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
                {(user.name[0] ?? '').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-text truncate">{user.name}</div>
                <div className="text-[11px] text-muted">마이페이지 →</div>
              </div>
            </Link>
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

        <div className="px-5 pt-2 pb-3">
          <Link
            href="/짧은상담"
            className="flex items-center justify-center w-full bg-navy text-white py-3.5 px-4 text-sm font-bold tracking-wide no-underline hover:bg-navy-dark transition-colors"
            onClick={() => setOpen(false)}
          >
            상담 신청 →
          </Link>
        </div>

        <nav className="flex-1 py-1 pb-4 flex flex-col">
          <div className="px-6 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">메뉴</div>
          <SItem href="/" label="멜른버그 AI" active={current === 'home'} icon={<AiIcon />} onClick={() => setOpen(false)} />
          <SItem href="/community" label="커뮤니티" active={current === 'community'} icon={<CommunityIcon />} onClick={() => setOpen(false)} />
          <SItem href="/apt-talk" label="아파트토론방" active={current === 'apt-talk'} icon={<ApartmentIcon />} onClick={() => setOpen(false)} />
          <SItem href="/blog" label="블로그" active={current === 'blog'} icon={<BlogIcon />} onClick={() => setOpen(false)} />

          <SectionToggle
            label="상담"
            open={consultOpen}
            onClick={() => setConsultOpen((v) => !v)}
          />
          {consultOpen && consults.map((p) => (
            <SItem
              key={p.id}
              href={`/${p.filename}`}
              label={p.name}
              price={p.price.toLocaleString('en-US')}
              active={current === p.filename}
              icon={p.id === 'short-consult' ? <ChatShortIcon /> : <ChatLongIcon />}
              onClick={() => setOpen(false)}
            />
          ))}

          <SectionToggle
            label="멤버십"
            open={membershipOpen}
            onClick={() => setMembershipOpen((v) => !v)}
          />
          {membershipOpen && memberships.map((p) => (
            <SItem
              key={p.id}
              href={`/${p.filename}`}
              label={p.id === 'new-membership' ? '2분기 신규가입' : '2분기 갱신'}
              price={p.price.toLocaleString('en-US')}
              active={current === p.filename}
              icon={p.id === 'new-membership' ? <StarIcon /> : <RenewIcon />}
              onClick={() => setOpen(false)}
            />
          ))}
        </nav>

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
        className="lg:hidden fixed top-3 left-3 z-30 w-9 h-9 border border-border bg-white text-navy flex items-center justify-center"
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

function SItem({ href, label, price, active, icon, onClick }: { href: string; label: string; price?: string; active?: boolean; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-6 py-3 text-sm no-underline relative border-l-[3px] transition-colors ${active ? 'bg-navy-soft text-navy font-bold border-navy' : 'text-text font-medium border-transparent hover:bg-navy-soft'}`}
    >
      {icon}
      <span>{label}</span>
      {price && <span className={`ml-auto text-[11px] font-semibold ${active ? 'text-navy' : 'text-muted'}`}>{price}</span>}
      {active && <span className="absolute right-5 text-lg leading-none text-navy">›</span>}
    </Link>
  );
}

function SectionToggle({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between w-full px-6 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted hover:text-navy transition-colors"
      aria-expanded={open}
    >
      <span>{label}</span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform ${open ? 'rotate-180' : ''}`}
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
const ApartmentIcon = () => <svg {...iconProps}><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></svg>;
const ChatShortIcon = () => <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
const ChatLongIcon = () => <svg {...iconProps}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>;
const StarIcon = () => <svg {...iconProps}><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" /></svg>;
const RenewIcon = () => <svg {...iconProps}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>;

const AiIcon = () => <svg {...iconProps} viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
