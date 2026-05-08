-- ──────────────────────────────────────────────
-- 190: 단지별 사진 등록
-- 각 단지(apt_master) 페이지에 사진 업로드 + 갤러리.
-- - 누구나 볼 수 있음 (public read)
-- - 로그인 사용자만 업로드
-- - 업로더 본인 또는 admin 만 삭제
-- ──────────────────────────────────────────────

create table if not exists public.apt_photos (
  id bigserial primary key,
  apt_master_id bigint not null references public.apt_master(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  caption text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists apt_photos_apt_idx
  on public.apt_photos(apt_master_id, created_at desc)
  where deleted_at is null;
create index if not exists apt_photos_uploader_idx
  on public.apt_photos(uploader_id, created_at desc)
  where deleted_at is null;

alter table public.apt_photos enable row level security;

drop policy if exists "apt_photos read all" on public.apt_photos;
create policy "apt_photos read all" on public.apt_photos
  for select using (deleted_at is null);

drop policy if exists "apt_photos insert auth" on public.apt_photos;
create policy "apt_photos insert auth" on public.apt_photos
  for insert with check (auth.uid() = uploader_id);

drop policy if exists "apt_photos delete own" on public.apt_photos;
create policy "apt_photos delete own" on public.apt_photos
  for update using (
    auth.uid() = uploader_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
  with check (
    auth.uid() = uploader_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

notify pgrst, 'reload schema';
