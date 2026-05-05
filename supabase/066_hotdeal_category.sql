-- ──────────────────────────────────────────────
-- 066: 핫딜 카테고리 추가 + posts.category check 제약 확장
-- 'hotdeal' 게시판 — 입주민·매매·임대 핫딜 정보 공유.
-- 적립 mlbg 가 일반 커뮤글 (2 mlbg) 보다 높음 → 5 mlbg base.
-- AI 평가는 동일 룰 적용 (1줄 0.1, 100자 미만 0.5 cap 등).
-- ──────────────────────────────────────────────

alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts
  add constraint posts_category_check
  check (category in ('community', 'blog', 'hotdeal'));

-- 핫딜 카테고리 인덱스. deleted_at 컬럼은 SQL 064 적용 후 자동으로 일반
-- posts_active 인덱스에 포함되므로 여기선 단순 필터만.
create index if not exists posts_hotdeal_idx
  on public.posts(created_at desc)
  where category = 'hotdeal';

comment on constraint posts_category_check on public.posts is
  'community = 일반, blog = 조합원 전용 블로그, hotdeal = 핫딜 정보 공유 (적립 5x)';
