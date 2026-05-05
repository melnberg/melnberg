'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { type FeedItem } from './AptMap';
import Nickname from './Nickname';
import RewardTooltip from './RewardTooltip';
import { feedItemToNicknameInfo } from '@/lib/nickname-info';

const SCROLL_KEY = 'mlbg.feed.scroll';
const LAST_CLICK_KEY = 'mlbg.feed.lastClick';

type Props = { items: FeedItem[] };

function relTime(iso: string): string {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

// 피드 아이템 → 풀페이지 라우트 (모바일 SNS 모델)
function hrefFor(f: FeedItem): string | null {
  if ((f.kind === 'auction' || f.kind === 'auction_bid') && f.auction_id) return `/auctions/${f.auction_id}`;
  if (f.kind === 'post' || f.kind === 'post_comment') return f.post_id ? `/community/${f.post_id}` : null;
  if (f.kind === 'notice' && f.notice_href) return f.notice_href;
  // 단지 토론·매물·호가 — 모두 단지 페이지 /apt/{apt_master_id} 로 통합
  if (
    f.kind === 'discussion' || f.kind === 'comment' ||
    f.kind === 'listing' || f.kind === 'offer' || f.kind === 'snatch'
  ) return f.apt_master_id ? `/apt/${f.apt_master_id}` : null;
  // 시설 — 풀페이지
  if (f.kind === 'emart_occupy' || f.kind === 'emart_comment') return `/e/${f.apt_master_id}`;
  if (f.kind === 'factory_occupy' || f.kind === 'factory_comment') return `/f/${f.apt_master_id}`;
  return null;
}

function rewardKind(k: FeedItem['kind']): React.ComponentProps<typeof RewardTooltip>['kind'] {
  if (k === 'discussion') return 'apt_post';
  if (k === 'comment') return 'apt_comment';
  if (k === 'post') return 'community_post';
  if (k === 'post_comment') return 'community_comment';
  if (k === 'factory_comment') return 'factory_comment';
  if (k === 'emart_comment') return 'emart_comment';
  return undefined;
}

function badgeFor(f: FeedItem): { label: string; cls: string } | null {
  switch (f.kind) {
    case 'auction':       return { label: 'LIVE',   cls: 'bg-[#dc2626] text-white animate-pulse' };
    case 'auction_bid':   return { label: '입찰',   cls: 'bg-[#dc2626] text-white' };
    case 'comment':
    case 'post_comment':
    case 'emart_comment':
    case 'factory_comment': return { label: '댓글', cls: 'bg-cyan/15 text-cyan' };
    case 'listing':       return { label: '매물',   cls: 'bg-[#fce7f3] text-[#9d174d]' };
    case 'offer':         return { label: '매수',   cls: 'bg-navy text-white' };
    case 'snatch':        return { label: '내놔',   cls: 'bg-red-500 text-white' };
    case 'emart_occupy':
    case 'factory_occupy': return { label: '분양',  cls: 'bg-[#F5A623] text-white' };
    case 'notice':        return { label: '공지',   cls: 'bg-navy text-white' };
    default: return null;
  }
}

export default function MobileFeedList({ items }: Props) {
  const [lastClickKey, setLastClickKey] = useState<string | null>(null);

  // 브라우저 자동 스크롤 복원 끄기 — 우리가 sessionStorage 로 직접 관리.
  // 이 옵션이 켜져있으면 뒤로가기 시 떠나는 페이지에 잘못된 스크롤이 적용됨.
  useEffect(() => {
    if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  // 마운트 시 — 저장된 스크롤 복원 + 마지막 클릭 키 읽기.
  // 브라우저 자체 scroll restoration 이 늦게 발화될 수 있어 여러 시점에 보강.
  useEffect(() => {
    try {
      const lastKey = sessionStorage.getItem(LAST_CLICK_KEY);
      const scrollStr = sessionStorage.getItem(SCROLL_KEY);
      if (lastKey) setLastClickKey(lastKey);
      if (!scrollStr) return;
      const y = Number(scrollStr);
      if (!Number.isFinite(y) || y <= 0) return;

      const restore = () => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
      // 다중 시도 — RAF 2회 + setTimeout 50/200/400ms.
      // Next.js 라우터의 기본 스크롤 동작이나 브라우저 restoration 이 늦게 덮어쓰는 경우 대응.
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
      });
      const t1 = setTimeout(restore, 50);
      const t2 = setTimeout(restore, 200);
      const t3 = setTimeout(() => {
        restore();
        sessionStorage.removeItem(SCROLL_KEY);
      }, 400);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    } catch { /* SSR / blocked storage */ }
  }, []);

  // 카드 클릭 직전 — 현재 스크롤 + 클릭 키 저장
  function rememberPosition(key: string) {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      sessionStorage.setItem(LAST_CLICK_KEY, key);
    } catch { /* ignore */ }
  }

  if (items.length === 0) {
    return <div className="px-4 py-12 text-center text-[13px] text-muted">아직 작성된 글이 없어요.</div>;
  }

  return (
    <div className="bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-border h-[52px] relative flex items-center justify-center">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <img src="/logo.svg" alt="" className="w-7 h-7 flex-shrink-0" />
          <span className="text-[17px] font-bold text-navy tracking-tight">멜른버그</span>
        </Link>
        <Link href="/?view=map" className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-navy no-underline px-2 py-1 border border-border hover:border-navy">
          지도 →
        </Link>
      </div>
      <ul>
        {items.map((f) => {
          const href = hrefFor(f);
          const badge = badgeFor(f);
          const headLabel = f.kind === 'notice' ? '분양 공지'
            : (f.kind === 'emart_occupy' || f.kind === 'factory_occupy' || f.kind === 'emart_comment' || f.kind === 'factory_comment') ? (f.apt_nm ?? '시설')
            : (f.kind === 'post' || f.kind === 'post_comment') ? '커뮤니티'
            : (f.apt_nm ?? '');
          const fullContent = (f.content ?? '').trim();
          const isAuctionLive = f.kind === 'auction';

          const Wrapper: React.ElementType = href ? Link : 'div';
          const wrapperProps = href ? { href } : {};

          const itemKey = `${f.kind}-${f.id}`;
          const isLastClicked = itemKey === lastClickKey;
          const onItemClick = () => rememberPosition(itemKey);
          return (
            <li key={itemKey} className={`border-b border-[#f0f0f0] ${isAuctionLive ? 'bg-[#fef2f2] border-l-4 border-l-[#dc2626]' : isLastClicked ? 'bg-[#eef4fb]' : ''}`}>
              <div className="flex items-stretch">
                <Wrapper {...wrapperProps} onClick={onItemClick} className="flex-1 min-w-0 px-4 py-3 no-underline active:bg-[#f5f7fa]">
                  {/* 헤더 — 헤드라벨 + 작성자 */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    {headLabel && (
                      <span className="text-[12px] font-bold text-navy truncate flex-1 min-w-0">{headLabel}</span>
                    )}
                    {f.author_id && (
                      <span className="text-[11px] flex-shrink-0">
                        <Nickname info={feedItemToNicknameInfo(f)} />
                      </span>
                    )}
                  </div>
                  {/* 본문 */}
                  <div className="flex items-start gap-1.5">
                    {badge && (
                      <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 flex-shrink-0 mt-0.5 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                    <span className="text-[13px] text-text leading-snug whitespace-pre-wrap break-words flex-1 min-w-0">
                      {(fullContent || f.title) ? (
                        <>
                          {f.title && !fullContent && <span>{f.title}</span>}
                          {fullContent && <span>{fullContent}</span>}
                        </>
                      ) : null}
                    </span>
                  </div>
                  {/* 메타 — 시각 + 보상 */}
                  <div className="text-[10px] text-muted mt-1.5 flex items-center gap-2">
                    <span>{relTime(f.created_at)} 전</span>
                    {typeof f.earned_mlbg === 'number' && (
                      <RewardTooltip earned={f.earned_mlbg} kind={rewardKind(f.kind)} />
                    )}
                  </div>
                </Wrapper>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
