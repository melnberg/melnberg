-- ──────────────────────────────────────────────
-- 020: 단지 마스터에 K-apt 기본정보 컬럼 추가
-- 세대수 기반으로 작은 단지 핀 숨김 + 단지 메타정보 표시용
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

alter table public.apt_master
  add column if not exists kapt_code text,
  add column if not exists household_count int,        -- 총 세대수
  add column if not exists building_count int,         -- 동수
  add column if not exists kapt_build_year int,        -- 건축연도
  add column if not exists kapt_fetched_at timestamptz;

create index if not exists apt_master_household_idx
  on public.apt_master (household_count)
  where household_count is not null;

-- 핀 가시성 결정 view — 향후 fetchAptPins에서 이 view 사용해도 됨
-- 현재는 직접 apt_master 사용 + 클라이언트에서 필터
create or replace view public.apt_master_visible as
select * from public.apt_master
where lat is not null and lng is not null
  and (household_count is null or household_count >= 50);  -- 임시 기준; 사용자 설정 후 조정

comment on column public.apt_master.kapt_code is 'K-apt 단지 고유번호 (한국부동산원). null이면 K-apt 미매칭.';
comment on column public.apt_master.household_count is '총 세대수 (kaptdaCnt). 작은 단지 필터링 기준.';
