-- ──────────────────────────────────────────────
-- 207: feedback 이미지 첨부
-- 마이페이지 > 내 건의사항에서 직접 작성 가능 + 30MB 이미지 첨부.
-- 이미지는 기존 post-images 버킷 (199 에서 30MB 로 상향) 재사용 — public URL 만 배열로 저장.
-- ──────────────────────────────────────────────

alter table public.feedback
  add column if not exists image_urls text[];

comment on column public.feedback.image_urls is '첨부 이미지 public URL 배열. post-images 버킷 사용.';
