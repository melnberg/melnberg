-- ──────────────────────────────────────────────
-- 161: 주식 토론방 카테고리 추가
-- posts.category check 제약 확장 — 'stocks' 추가
-- 보상 룰은 community 와 동일 (PostForm/award route 가 community_post/comment kind 로 fallback)
-- ──────────────────────────────────────────────

alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts
  add constraint posts_category_check
  check (category in ('community', 'blog', 'hotdeal', 'stocks'));

create index if not exists posts_stocks_idx
  on public.posts(created_at desc)
  where category = 'stocks';

comment on constraint posts_category_check on public.posts is
  'community = 일반, blog = 조합원 블로그, hotdeal = 핫딜 (적립 2.5x), stocks = 주식 토론 (community 와 동일 적립)';

notify pgrst, 'reload schema';
