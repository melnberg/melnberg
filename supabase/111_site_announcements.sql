-- ──────────────────────────────────────────────
-- 111: 사이트 공지 (site_announcements)
-- 어드민이 카페 새 글 / 사이트 공지 등을 작성하면 홈 피드 상단 + 텔레그램 동시 발송.
-- ──────────────────────────────────────────────

create table if not exists public.site_announcements (
  id bigserial primary key,
  title text not null,
  body text,
  link_url text,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists site_announcements_recent_idx
  on public.site_announcements(created_at desc)
  where deleted_at is null;

alter table public.site_announcements enable row level security;

drop policy if exists "site_announcements readable by all" on public.site_announcements;
create policy "site_announcements readable by all"
  on public.site_announcements for select using (deleted_at is null);

-- INSERT/UPDATE/DELETE 는 어드민 전용 (RPC 우회 방지 — 정책 강제)
drop policy if exists "site_announcements admin write" on public.site_announcements;
create policy "site_announcements admin write"
  on public.site_announcements for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "site_announcements admin update" on public.site_announcements;
create policy "site_announcements admin update"
  on public.site_announcements for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "site_announcements admin delete" on public.site_announcements;
create policy "site_announcements admin delete"
  on public.site_announcements for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

notify pgrst, 'reload schema';
