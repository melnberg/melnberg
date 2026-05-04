-- ──────────────────────────────────────────────
-- 005: 조합원 전용 게시글 게이팅
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- 1. posts에 is_paid_only 컬럼 추가
alter table public.posts
  add column if not exists is_paid_only boolean default false not null;

create index if not exists posts_is_paid_only_idx on public.posts (is_paid_only)
  where is_paid_only = true;
