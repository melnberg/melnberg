-- ──────────────────────────────────────────────
-- 052: profiles.bio — 개인 자기소개
-- /u/{user_id} 프로필 페이지에서 표시·편집
-- ──────────────────────────────────────────────

alter table public.profiles
  add column if not exists bio text;

comment on column public.profiles.bio is '자기소개. /u/{user_id} 페이지에 표시.';
