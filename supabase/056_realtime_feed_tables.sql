-- ──────────────────────────────────────────────
-- 056: 피드 테이블들 Realtime 활성화
-- 새 글/댓글 INSERT 시 모든 클라이언트에 즉시 push → 피드 즉시 갱신
-- ──────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'apt_discussions'
  ) then
    alter publication supabase_realtime add table public.apt_discussions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'apt_discussion_comments'
  ) then
    alter publication supabase_realtime add table public.apt_discussion_comments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
