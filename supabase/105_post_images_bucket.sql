-- ──────────────────────────────────────────────
-- 105: 글 본문 이미지 첨부용 Storage 버킷
-- 핫딜 글 등에서 사진 업로드 → URL 을 본문에 삽입.
-- 055 의 avatars 버킷 패턴과 동일 — 본인 폴더(/userId/...) 에만 쓰기.
-- ──────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,  -- 5MB
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post-images: public read" on storage.objects;
create policy "post-images: public read"
  on storage.objects for select
  using (bucket_id = 'post-images');

drop policy if exists "post-images: own upload" on storage.objects;
create policy "post-images: own upload"
  on storage.objects for insert
  with check (
    bucket_id = 'post-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "post-images: own update" on storage.objects;
create policy "post-images: own update"
  on storage.objects for update
  using (
    bucket_id = 'post-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "post-images: own delete" on storage.objects;
create policy "post-images: own delete"
  on storage.objects for delete
  using (
    bucket_id = 'post-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
