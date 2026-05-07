'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type FeedItem } from './AptMap';
import Nickname from './Nickname';
import RewardTooltip from './RewardTooltip';
import InlineCommentBox, { type InlineKind } from './InlineCommentBox';
import { feedItemToNicknameInfo } from '@/lib/nickname-info';
import { createClient } from '@/lib/supabase/client';
import { KidsIcon, RestaurantIcon } from './CategoryIcons';

const SCROLL_KEY = 'mlbg.feed.scroll';
const LAST_CLICK_KEY = 'mlbg.feed.lastClick';

// kind → InlineCommentBox 가 다룰 부모 식별. 댓글 자체 종류는 펼치기 미지원.
function inlineKindFor(f: FeedItem): { kind: InlineKind; parentId: number } | null {
  if (f.kind === 'discussion') return { kind: 'discussion', parentId: f.id };
  if (f.kind === 'post') return f.post_id ? { kind: 'post', parentId: f.post_id } : null;
  if (f.kind === 'emart_occupy') return { kind: 'emart_occupy', parentId: f.apt_master_id };
  if (f.kind === 'factory_occupy') return { kind: 'factory_occupy', parentId: f.apt_master_id };
  return null;
}

type Props = { items: FeedItem[] };

// 본문에 섞여 있는 이미지 URL (http(s)://...jpg|jpeg|png|gif|webp[?…]) 을 <img> 로 치환.
// 이미지 클릭은 부모 카드 Link 로 전파 → 이미지 새 탭 안 뜨고 게시글 페이지로 이동.
// 정사각형 (Instagram 스타일) — aspect-square 컨테이너 + object-cover.
const IMG_URL_RE = /(https?:\/\/[^\s]+?\.(?:jpe?g|png|gif|webp)(?:\?[^\s]*)?)/gi;
function renderContentWithImages(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(IMG_URL_RE);
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      return (
        <span key={i} className="block my-2 max-w-[400px] mx-auto">
          <span className="block aspect-square w-full bg-bg/30 border border-border rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt="" loading="lazy" className="w-full h-full object-cover" />
          </span>
        </span>
      );
    }
    return p ? <span key={i}>{p}</span> : null;
  });
}

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
  if (f.kind === 'post' || f.kind === 'post_comment') {
    if (!f.post_id) return null;
    const base = f.post_category === 'hotdeal' ? '/hotdeal'
               : f.post_category === 'stocks' ? '/stocks'
               : '/community';
    return `${base}/${f.post_id}`;
  }
  if (f.kind === 'notice' && f.notice_href) return f.notice_href;
  // 단지 토론·매물·호가 — 모두 단지 페이지 /apt/{apt_master_id} 로 통합
  if (
    f.kind === 'discussion' || f.kind === 'comment' ||
    f.kind === 'listing' || f.kind === 'offer' || f.kind === 'snatch' ||
    f.kind === 'sell_complete'
  ) return f.apt_master_id ? `/apt/${f.apt_master_id}` : null;
  if ((f.kind === 'restaurant_register' || f.kind === 'restaurant_comment') && f.restaurant_id) {
    return `/restaurants/${f.restaurant_id}`;
  }
  if ((f.kind === 'kids_register' || f.kind === 'kids_comment') && f.kids_id) {
    return `/kids/${f.kids_id}`;
  }
  // 시설 — 풀페이지
  if (f.kind === 'emart_occupy' || f.kind === 'emart_comment') return `/e/${f.apt_master_id}`;
  if (f.kind === 'factory_occupy' || f.kind === 'factory_comment') return `/f/${f.apt_master_id}`;
  return null;
}

function rewardKind(f: FeedItem): React.ComponentProps<typeof RewardTooltip>['kind'] {
  const k = f.kind;
  if (k === 'discussion') return 'apt_post';
  if (k === 'comment') return 'apt_comment';
  if (k === 'post') return f.post_category === 'hotdeal' ? 'hotdeal_post' : 'community_post';
  if (k === 'post_comment') return f.post_category === 'hotdeal' ? 'hotdeal_comment' : 'community_comment';
  if (k === 'factory_comment') return 'factory_comment';
  if (k === 'emart_comment') return 'emart_comment';
  return undefined;
}

// 절대규칙 — 모든 피드 게시글에 mlbg 보상/금액 표시.
// earned_mlbg 가 없는 종류 (listing, offer, snatch, auction, restaurant_register, kids_register 등)
// 의 fallback. PC 피드 (AptMap.tsx) 와 동일 로직 — 새 종류 추가 시 양쪽 모두 갱신.
function fallbackRewardText(f: FeedItem): string {
  if (f.kind === 'restaurant_register' || f.kind === 'kids_register') return '+30 mlbg';
  if (f.kind === 'restaurant_comment' || f.kind === 'kids_comment') return '+0.5 mlbg';
  if (f.kind === 'listing') return typeof f.listing_price === 'number' ? `호가 ${f.listing_price.toLocaleString()} mlbg` : '매물 등록';
  if (f.kind === 'offer') return typeof f.listing_price === 'number' ? `매수 ${f.listing_price.toLocaleString()} mlbg` : '매수 호가';
  if (f.kind === 'snatch') return '내놔 (무상)';
  if (f.kind === 'auction') return typeof f.listing_price === 'number' ? `현재가 ${f.listing_price.toLocaleString()} mlbg` : '경매 진행';
  if (f.kind === 'auction_bid') return '입찰';
  if (f.kind === 'auction_won') return '🏆 낙찰';
  if (f.kind === 'sell_complete') return typeof f.sell_price === 'number' ? `${f.sell_price.toLocaleString()} mlbg 거래` : '거래 성사';
  if (f.kind === 'emart_occupy' || f.kind === 'factory_occupy') return '분양 (−mlbg)';
  if (f.kind === 'strike') return typeof f.strike_loss_mlbg === 'number' ? `−${f.strike_loss_mlbg.toLocaleString()} mlbg` : '−mlbg';
  if (f.kind === 'bridge_toll') return typeof f.bridge_toll_amount === 'number' ? `통행료 ${f.bridge_toll_amount.toLocaleString()} mlbg` : '통행료';
  if (f.kind === 'notice') return '공지';
  return '';
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
    case 'strike':        return { label: '파업',   cls: 'bg-[#dc2626] text-white animate-pulse' };
    case 'bridge_toll':   return { label: '통행료', cls: 'bg-[#0070C0] text-white' };
    case 'sell_complete': return { label: '거래성사', cls: 'bg-[#16a34a] text-white' };
    case 'restaurant_register': return { label: '맛집', cls: 'bg-[#fbbf24] text-[#78350f]' };
    case 'restaurant_comment':  return { label: '맛집댓글', cls: 'bg-[#fef3c7] text-[#78350f]' };
    case 'kids_register': return { label: '육아장소', cls: 'bg-[#fbcfe8] text-[#831843]' };
    case 'kids_comment':  return { label: '육아댓글', cls: 'bg-[#fdf2f8] text-[#831843]' };
    default: return null;
  }
}

// 점진적 노출 — 초기 30개만 렌더, 바닥 근처 도달 시 30개씩 추가.
// 한번에 300개 다 렌더하면 모바일에서 스크롤 끊김 + 메모리 부담. IntersectionObserver 로 부드럽게.
const INITIAL_VISIBLE = 30;
const REVEAL_STEP = 30;

// 클라이언트 셔플 — 서버의 feedWeight 와 동일 시그널.
// 서버는 90초 캐시라 같은 사용자가 여러 번 진입해도 같은 순서. 클라에서 매 마운트마다
// random 키만 새로 — 가중치는 동일하므로 분포는 보존.
const IMG_RE_W = /https?:\/\/[^\s]+?\.(?:jpe?g|png|gif|webp)(?:\?[^\s]*)?/i;
function feedWeightClient(f: FeedItem, now: number): number {
  let w = 1;
  if (f.content && IMG_RE_W.test(f.content)) w += 2.5;
  if ((f.earned_mlbg ?? 0) > 0) w += 1.5;
  if ((f.comment_count ?? 0) >= 3) w += 1.5;
  if ((f.discussion_like_count ?? 0) >= 3) w += 1.0;
  const ageHours = (now - new Date(f.created_at).getTime()) / 3600000;
  if (ageHours > 168) w *= 0.5;
  return Math.max(w, 0.01);
}

// auction / notice 는 강제 상단 — 셔플 대상 아님. 서버에서 이미 앞쪽에 배치돼 들어옴.
function isFixedKind(k: FeedItem['kind']): boolean {
  return k === 'auction' || k === 'auction_bid' || k === 'auction_won' || k === 'notice';
}

function shuffleItems(items: FeedItem[]): FeedItem[] {
  const fixed: FeedItem[] = [];
  const shufflable: FeedItem[] = [];
  for (const f of items) {
    if (isFixedKind(f.kind)) fixed.push(f);
    else shufflable.push(f);
  }
  const now = Date.now();
  const shuffled = shufflable
    .map((f) => ({ f, key: -Math.log(Math.random()) / feedWeightClient(f, now) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.f);
  return [...fixed, ...shuffled];
}

export default function MobileFeedList({ items }: Props) {
  const [lastClickKey, setLastClickKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  // 셔플 시드 — 증가시키면 useMemo 가 재계산. 마운트 시 1, 새로고침 클릭마다 +1.
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const displayItems = useMemo(() => shuffleItems(items), [items, shuffleSeed]);
  const [visibleCount, setVisibleCount] = useState(Math.min(INITIAL_VISIBLE, items.length));
  const sentinelRef = useRef<HTMLDivElement>(null);

  // items 또는 셔플 시드 변경 시 visibleCount 재초기화
  useEffect(() => {
    setVisibleCount(Math.min(INITIAL_VISIBLE, displayItems.length));
  }, [displayItems]);

  // 바닥 근처 도달 → 30개씩 추가 노출
  useEffect(() => {
    if (visibleCount >= displayItems.length) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => Math.min(c + REVEAL_STEP, displayItems.length));
      }
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visibleCount, displayItems.length]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
      const name = (prof as { display_name?: string } | null)?.display_name
        ?? (user.user_metadata?.display_name as string | undefined)
        ?? user.email?.split('@')[0] ?? '회원';
      if (!cancelled) setMe({ id: user.id, name });
    })();
    return () => { cancelled = true; };
  }, []);

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
      {/* 상단 멜른버그 바는 Layout 의 MobileTopBar 가 모든 화면 공통으로 처리 — 여기선 제거 */}
      {/* 새로고침 — 클라이언트 셔플만 (서버 재요청 X). 시드 증가 → useMemo 재계산. */}
      <div className="flex justify-end px-4 py-2 border-b border-border">
        <button
          type="button"
          onClick={() => { setShuffleSeed((n) => n + 1); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }}
          className="text-[12px] text-cyan border border-cyan/40 rounded-full px-2.5 py-0.5 cursor-pointer bg-transparent hover:bg-cyan/10 active:bg-cyan/20"
          aria-label="피드 새로고침"
        >
          🔄 새로고침
        </button>
      </div>
      <ul>
        {displayItems.slice(0, visibleCount).map((f) => {
          const href = hrefFor(f);
          const badge = badgeFor(f);
          // 단지 관련 kind 의 헤드라벨엔 동 prefix (예: "역삼동 역삼래미안")
          const aptHeadLabel = f.apt_nm ? (f.dong ? `${f.dong} ${f.apt_nm}` : f.apt_nm) : '';
          const headLabel: React.ReactNode = f.kind === 'notice' ? '분양 공지'
            : f.kind === 'strike' ? '💥 파업'
            : f.kind === 'bridge_toll' ? '🌉 다리 통행료'
            : f.kind === 'sell_complete' ? '🤝 거래성사'
            : f.kind === 'restaurant_register' ? <span className="inline-flex items-center gap-1"><RestaurantIcon className="w-[12px] h-[12px]" /> {f.restaurant_name ?? '맛집'}</span>
            : f.kind === 'restaurant_comment' ? <span className="inline-flex items-center gap-1"><RestaurantIcon className="w-[12px] h-[12px]" /> {f.restaurant_name ?? '맛집'}</span>
            : f.kind === 'kids_register' ? <span className="inline-flex items-center gap-1"><KidsIcon className="w-[12px] h-[12px]" /> {f.kids_name ?? '육아 장소'}</span>
            : f.kind === 'kids_comment' ? <span className="inline-flex items-center gap-1"><KidsIcon className="w-[12px] h-[12px]" /> {f.kids_name ?? '육아 장소'}</span>
            : (f.kind === 'emart_occupy' || f.kind === 'factory_occupy' || f.kind === 'emart_comment' || f.kind === 'factory_comment') ? (f.apt_nm ?? '시설')
            : (f.kind === 'post' || f.kind === 'post_comment') ? (
                f.post_category === 'hotdeal' ? '🔥 핫딜'
                : f.post_category === 'stocks' ? '📈 주식 토론'
                : '커뮤니티'
              )
            : aptHeadLabel;
          const fullContent = (f.content ?? '').trim();
          const isAuctionLive = f.kind === 'auction';
          const isStrike = f.kind === 'strike';

          const Wrapper: React.ElementType = href ? Link : 'div';
          const wrapperProps = href ? { href } : {};

          const itemKey = `${f.kind}-${f.id}`;
          const isLastClicked = itemKey === lastClickKey;
          const onItemClick = () => rememberPosition(itemKey);
          const inlineCfg = inlineKindFor(f);
          const cnt = counts[itemKey] ?? f.comment_count ?? 0;
          const isExpanded = expandedKey === itemKey;
          return (
            <li key={itemKey} className={`border-b border-border ${isAuctionLive ? 'bg-[#fef2f2] border-l-4 border-l-[#dc2626]' : isStrike ? 'bg-[#fce7f3] border-l-4 border-l-[#db2777]' : isLastClicked ? 'bg-[#eef4fb]' : ''}`}>
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
                          {fullContent && <span>{renderContentWithImages(fullContent)}</span>}
                        </>
                      ) : null}
                    </span>
                  </div>
                  {/* 맛집 / 육아 사진 — 1:1 정사각형 (Instagram 스타일) */}
                  {f.kind === 'restaurant_register' && f.restaurant_photo_url && (
                    <div className="mt-2 max-w-[400px] mx-auto aspect-square bg-[#f0f0f0] rounded-xl overflow-hidden border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.restaurant_photo_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {f.kind === 'kids_register' && f.kids_photo_url && (
                    <div className="mt-2 max-w-[400px] mx-auto aspect-square bg-[#f0f0f0] rounded-xl overflow-hidden border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.kids_photo_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {/* 메타 — 시각 + 보상 + 댓글 카운트 (우측) */}
                  <div className="text-[10px] text-muted mt-1.5 flex items-center gap-2">
                    <span>{relTime(f.created_at)} 전</span>
                    {typeof f.earned_mlbg === 'number' ? (
                      <RewardTooltip earned={f.earned_mlbg} kind={rewardKind(f)} />
                    ) : (() => {
                      const txt = fallbackRewardText(f);
                      return txt ? <span className="tabular-nums">{txt}</span> : null;
                    })()}
                    {inlineCfg && (
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedKey(isExpanded ? null : itemKey); }}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-navy hover:bg-navy-soft cursor-pointer bg-transparent border-none"
                        aria-label={`댓글 ${cnt}개`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span className="tabular-nums">{cnt}</span>
                      </button>
                    )}
                  </div>
                </Wrapper>
              </div>
              {/* 인라인 댓글 영역 — 말풍선 클릭 시 펼침 */}
              {isExpanded && inlineCfg && (
                <InlineCommentBox
                  kind={inlineCfg.kind}
                  parentId={inlineCfg.parentId}
                  currentUserId={me?.id ?? null}
                  currentUserName={me?.name ?? null}
                  onCountChange={(n) => setCounts((c) => ({ ...c, [itemKey]: n }))}
                />
              )}
            </li>
          );
        })}
      </ul>
      {visibleCount < displayItems.length && (
        <div ref={sentinelRef} className="px-4 py-6 text-center text-[12px] text-muted">
          불러오는 중… ({visibleCount}/{displayItems.length})
        </div>
      )}
    </div>
  );
}
