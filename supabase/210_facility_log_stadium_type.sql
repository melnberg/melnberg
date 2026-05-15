-- ──────────────────────────────────────────────
-- 210: facility_income_log check 제약에 'stadium' 누락 수정
--
-- 206 이 auto_distribute_facility_income() 에 stadium 단계를 추가했지만
-- facility_income_log_facility_type_check (160 에서 생성) 는 안 고침.
-- → 매일 cron 이 stadium 행 INSERT 시도 → check 위반 → 트랜잭션 전체 롤백
-- → 시설 배당이 통째로 안 들어감. 2026-05-15 발견.
-- ──────────────────────────────────────────────

alter table public.facility_income_log
  drop constraint if exists facility_income_log_facility_type_check;

alter table public.facility_income_log
  add constraint facility_income_log_facility_type_check
  check (facility_type in ('emart','factory','restaurant','kids','stadium'));
