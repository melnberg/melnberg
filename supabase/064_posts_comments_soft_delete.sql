-- ──────────────────────────────────────────────
-- 064: posts·comments soft-delete (deleted_at)
-- 기존: hard delete → 글 누르면 404
-- 변경: soft delete → 피드에서 숨김 + 상세 페이지에서 '삭제됨' 안내
-- ──────────────────────────────────────────────

alter table public.posts
  add column if not exists deleted_at timestamptz;

alter table public.comments
  add column if not exists deleted_at timestamptz;

create index if not exists idx_posts_active on public.posts(category, created_at desc)
  where deleted_at is null;
create index if not exists idx_comments_active on public.comments(post_id, created_at)
  where deleted_at is null;

comment on column public.posts.deleted_at is 'soft-delete 시각. NULL = 활성. 활성만 피드/리스트에 노출.';
comment on column public.comments.deleted_at is 'soft-delete 시각. NULL = 활성.';
