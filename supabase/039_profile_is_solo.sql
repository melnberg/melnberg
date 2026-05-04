-- ──────────────────────────────────────────────
-- 039: profiles.is_solo — 미혼 솔로 표시
-- 체크 시 닉네임이 분홍색으로 표시됨
-- ──────────────────────────────────────────────

alter table public.profiles
  add column if not exists is_solo boolean not null default false;

comment on column public.profiles.is_solo is '미혼 솔로 자율 표시. true면 닉네임이 분홍색으로 렌더됨.';
