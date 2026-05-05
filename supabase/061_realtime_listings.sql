-- ──────────────────────────────────────────────
-- 061: apt_listings 실시간 구독 추가 + home-pins 캐시 단축
-- 점거·매물 변동을 anon 포함 모든 클라이언트가 즉시 받도록.
-- ──────────────────────────────────────────────

-- 1) apt_listings 를 Realtime publication 에 추가 (이미 있어도 안전)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'apt_listings'
  ) then
    execute 'alter publication supabase_realtime add table public.apt_listings';
  end if;
end $$;

-- 2) apt_master 도 한 번 더 보장 (053 에서 추가했지만 환경 차이 대비)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'apt_master'
  ) then
    execute 'alter publication supabase_realtime add table public.apt_master';
  end if;
end $$;

-- Realtime 구독에 anon 도 RLS 통과해야 변경 row 페이로드를 받음.
-- apt_master / apt_listings 둘 다 select using (true) 정책이 있는지 확인.
-- (없다면 아래로 보장)
alter table public.apt_master enable row level security;
drop policy if exists "apt_master readable by all" on public.apt_master;
create policy "apt_master readable by all" on public.apt_master for select using (true);
