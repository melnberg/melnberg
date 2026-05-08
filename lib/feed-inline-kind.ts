// 피드 말풍선(💬 인라인 댓글) 단일 진실원.
// PC 피드(AptMap) · 모바일 피드(MobileFeedList) 둘 다 이 함수만 import 한다.
// 새 카드 종류 추가 시 — 이 파일 한 줄만 추가하면 끝.
//
// 절대규칙:
// - inlineKindFor() 가 not null 인 카드 = 댓글 가능 카드
// - PC·모바일 둘 다 💬 + count 표시 + 클릭 시 인라인 펼침 동작 동일
// - 카드 본문 클릭은 별개 (PC=drawer iframe, 모바일=풀페이지) — 폼팩터 차이만 있음
//
// 자세한 룰은 CLAUDE.md 의 "피드 말풍선 절대규칙" 참고.

import type { FeedItem } from '@/components/AptMap';
import type { InlineKind } from '@/components/InlineCommentBox';

export function inlineKindFor(f: FeedItem): { kind: InlineKind; parentId: number } | null {
  if (f.kind === 'discussion') return { kind: 'discussion', parentId: f.id };
  if (f.kind === 'post') return f.post_id ? { kind: 'post', parentId: f.post_id } : null;
  if (f.kind === 'emart_occupy') return { kind: 'emart_occupy', parentId: f.apt_master_id };
  if (f.kind === 'factory_occupy') return { kind: 'factory_occupy', parentId: f.apt_master_id };
  if (f.kind === 'fortune_cookie') return { kind: 'fortune_cookie', parentId: f.id };
  return null;
}
