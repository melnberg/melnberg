-- ──────────────────────────────────────────────
-- 199: Storage 버킷 file_size_limit 5MB → 30MB
-- 클라이언트 변환 실패해서 원본 업로드 시도 시 5MB 막혀서 "exceeded the maximum" 에러 발생.
-- 클라이언트 fileToWebp 가 WebP/JPEG fallback 으로 압축은 시도하지만 변환 실패 케이스 안전망.
-- ──────────────────────────────────────────────

update storage.buckets set file_size_limit = 31457280  -- 30MB
  where id in ('post-images', 'avatars');

notify pgrst, 'reload schema';
