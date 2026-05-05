-- ──────────────────────────────────────────────
-- 053: apt_master Realtime 활성화
-- 점거인 변경 시 모든 클라이언트에 즉시 push
-- ──────────────────────────────────────────────

-- supabase_realtime publication 에 apt_master 추가 (이미 있으면 무시)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'apt_master'
  ) then
    alter publication supabase_realtime add table public.apt_master;
  end if;
end $$;
