-- ──────────────────────────────────────────────
-- 167: 주식 게시판 단일화 + 종목 태그 자유 입력
--
-- 변경 (옵션 B → 단일 게시판 + 자유 태그):
--   - posts.stock_code 의 FK 제약 제거 (자유 텍스트 태그 가능)
--   - 종목별 분리 X. /stocks 단일 게시판. 태그는 옵션·자유.
-- ──────────────────────────────────────────────

-- FK 제거 — 자유 텍스트로 사용
alter table public.posts drop constraint if exists posts_stock_code_fkey;

-- stock_code 컬럼은 유지 (이미 161/164 에서 추가됨)
-- 인덱스도 유지 (검색 시 활용)

comment on column public.posts.stock_code is '주식 게시판 글의 자유 태그 — 종목명/코드 등. NULL 허용 (옵션).';

notify pgrst, 'reload schema';
