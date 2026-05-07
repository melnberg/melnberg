// 피드 아이템 → 풀페이지 라우트.
// 모든 kind 에 valid URL 보장 — 데이터 누락 시 게시판 목록 또는 작성자 프로필로 fallback.
// MobileFeedList (모바일 피드) + AptMap (PC 피드 / iframe drawer) 공용.
import type { FeedItem } from '@/components/AptMap';

export function feedItemHref(item: FeedItem): string {
  if (item.kind === 'auction' || item.kind === 'auction_bid' || item.kind === 'auction_won') {
    return item.auction_id ? `/auctions/${item.auction_id}` : '/auctions';
  }
  if (item.kind === 'post' || item.kind === 'post_comment') {
    const base = item.post_category === 'hotdeal' ? '/hotdeal'
               : item.post_category === 'stocks' ? '/stocks'
               : item.post_category === 'realty' ? '/realty'
               : '/community';
    return item.post_id ? `${base}/${item.post_id}` : base;
  }
  if (item.kind === 'notice') return item.notice_href ?? '/';
  if (
    item.kind === 'discussion' || item.kind === 'comment' ||
    item.kind === 'listing' || item.kind === 'offer' || item.kind === 'snatch' ||
    item.kind === 'sell_complete'
  ) return item.apt_master_id ? `/apt/${item.apt_master_id}` : '/';
  if (item.kind === 'restaurant_register' || item.kind === 'restaurant_comment') {
    return item.restaurant_id ? `/restaurants/${item.restaurant_id}` : '/restaurants';
  }
  if (item.kind === 'kids_register' || item.kind === 'kids_comment') {
    return item.kids_id ? `/kids/${item.kids_id}` : '/kids';
  }
  if (item.kind === 'emart_occupy' || item.kind === 'emart_comment') {
    return item.apt_master_id ? `/e/${item.apt_master_id}` : '/';
  }
  if (item.kind === 'factory_occupy' || item.kind === 'factory_comment') {
    return item.apt_master_id ? `/f/${item.apt_master_id}` : '/';
  }
  // strike / bridge_toll 등 별도 상세 페이지 없는 종류 — 작성자 프로필 또는 홈
  if (item.author_id) return `/u/${item.author_id}`;
  return '/';
}
