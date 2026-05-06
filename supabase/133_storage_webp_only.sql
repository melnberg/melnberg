-- ──────────────────────────────────────────────
-- 133: 스토리지 버킷 mime 화이트리스트 — webp 만 허용 (용량관리)
-- post-images: webp + gif (애니메이션 보존)
-- avatars:     webp 만
-- 클라이언트는 이미 lib/image-to-webp.ts 로 자동 변환 후 업로드.
-- 이 제약은 그 안전장치 — 미변환 파일이 들어오면 storage 가 즉시 reject.
-- ──────────────────────────────────────────────

update storage.buckets
  set allowed_mime_types = array['image/webp','image/gif']
  where id = 'post-images';

update storage.buckets
  set allowed_mime_types = array['image/webp']
  where id = 'avatars';
