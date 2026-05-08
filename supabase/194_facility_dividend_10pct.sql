-- ──────────────────────────────────────────────
-- 194: 상업시설 일 배당금 = 시설가격(occupy_price) 의 10%
-- 대상:
--   - public.factory_locations (다리 brand='bridge' 는 통행료 시스템이라 제외)
--   - public.restaurant_pins
--   - public.kids_pins
-- 이마트(emart)는 분양가·일수익이 코드 하드코딩이라 별도 반영 X (필요 시 별도 마이그레이션).
-- 일 배당 분배는 160_facility_income_log.sql 의 auto_distribute_facility_income() 가 매일 실행됨.
-- ──────────────────────────────────────────────

update public.factory_locations
set daily_income = round((occupy_price * 0.10)::numeric, 2)
where brand <> 'bridge'
  and occupy_price is not null
  and occupy_price > 0;

update public.restaurant_pins
set daily_income = round((occupy_price * 0.10)::numeric, 2)
where occupy_price is not null
  and occupy_price > 0;

update public.kids_pins
set daily_income = round((occupy_price * 0.10)::numeric, 2)
where occupy_price is not null
  and occupy_price > 0;

-- 신규 가게/장소 등록 시 default 값도 같이 업데이트 (분양가 100 → 일수익 10).
alter table public.restaurant_pins alter column daily_income set default 10;
alter table public.kids_pins alter column daily_income set default 10;

notify pgrst, 'reload schema';
