-- ──────────────────────────────────────────────
-- 055: profiles.avatar_url + Storage 'avatars' 버킷
-- 닉네임 옆 동그란 프로필 사진
-- ──────────────────────────────────────────────

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is '프로필 사진 public URL. avatars 버킷 또는 외부 URL.';

-- Storage 버킷 (public — 누구나 GET 가능)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS — 경로 prefix 가 본인 user_id 인 파일만 업로드/수정/삭제 가능
drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: own upload" on storage.objects;
create policy "avatars: own upload"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: own delete" on storage.objects;
create policy "avatars: own delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
