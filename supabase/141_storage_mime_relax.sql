-- ──────────────────────────────────────────────
-- 141: 스토리지 mime 화이트리스트 완화 (133 의 webp-only 정책 부분 롤백)
--
-- 사고 (2026-05-06): 아이폰 Safari 에서 createImageBitmap/canvas.toBlob('image/webp') 가
-- 일부 환경에서 작동 안 함 → 클라가 원본 jpeg 로 fallback → 버킷이 webp-only 정책으로 거절
-- → "업로드 실패: mime type image/jpeg is not supported" 에러.
--
-- 해결: 버킷 다시 jpeg/png/webp/gif 모두 허용. 클라 변환은 best-effort 로 유지
-- (대부분 webp 로 변환되므로 storage 절감 효과는 거의 그대로).
-- ──────────────────────────────────────────────

update storage.buckets
  set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
  where id = 'post-images';

update storage.buckets
  set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
  where id = 'avatars';
