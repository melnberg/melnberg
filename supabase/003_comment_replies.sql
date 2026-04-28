-- ──────────────────────────────────────────────
-- 003: 댓글의 댓글 (답글) 기능
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- comments에 parent_id 컬럼 추가 (자기참조)
alter table public.comments
  add column if not exists parent_id bigint references public.comments(id) on delete cascade;

create index if not exists comments_parent_id_idx on public.comments (parent_id, created_at);
