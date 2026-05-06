-- ──────────────────────────────────────────────
-- 137: 성능 — apt_representative_price 머터리얼화 + 인덱스 (2단계)
-- 사고 (2026-05-06) 후 Query Performance 분석:
--   1) apt_representative_price view : 1003회 호출, 14m, max 7.6s
--      → 매 호출마다 apt_trades 풀스캔 + group by. materialized view 로 전환.
--   2) apt_master_with_listing view  : 3624회 호출, 18m, max 3s
--      → home-pins 가 페이지네이션 50회 도는 게 원인. base 테이블 인덱스로 가속.
--   3) apt_trades 자체에 group by / date filter 인덱스 부재 → seq scan
-- ──────────────────────────────────────────────

-- 1) apt_representative_price : view → materialized view
-- ai 답변에서 50개 페이지 × 1000행 fetch 가 매 요청마다 돌면서 부하. MV 로 전환.
drop materialized view if exists public.apt_representative_price_mv cascade;

create materialized view public.apt_representative_price_mv as
with valid_trades as (
  select
    apt_nm,
    lawd_cd,
    dong as umd_nm,
    floor(exclu_use_ar / 5) * 5 as area_group,
    deal_amount,
    make_date(deal_year::int, deal_month::int, deal_day::int) as deal_date
  from public.apt_trades
  where (cancel_deal_type is null or cancel_deal_type = '')
    and (deal_type is null or deal_type <> '직거래')
    and (floor is null or floor <> 1)
    and make_date(deal_year::int, deal_month::int, deal_day::int) >= (current_date - interval '6 months')
),
agg as (
  select
    apt_nm, lawd_cd, umd_nm, area_group,
    count(*) filter (where deal_date >= current_date - interval '2 months') as cnt_2m,
    count(*) filter (where deal_date >= current_date - interval '3 months') as cnt_3m,
    count(*) as cnt_6m,
    avg(deal_amount) filter (where deal_date >= current_date - interval '2 months') as avg_2m,
    avg(deal_amount) filter (where deal_date >= current_date - interval '3 months') as avg_3m,
    avg(deal_amount) as avg_6m,
    min(deal_amount) filter (where deal_date >= current_date - interval '2 months') as min_2m,
    min(deal_amount) filter (where deal_date >= current_date - interval '3 months') as min_3m,
    min(deal_amount) as min_6m,
    max(deal_amount) filter (where deal_date >= current_date - interval '2 months') as max_2m,
    max(deal_amount) filter (where deal_date >= current_date - interval '3 months') as max_3m,
    max(deal_amount) as max_6m,
    max(deal_date) as last_deal_date
  from valid_trades
  group by apt_nm, lawd_cd, umd_nm, area_group
)
select
  apt_nm, lawd_cd, umd_nm, area_group,
  case when cnt_2m >= 3 then cnt_2m when cnt_3m >= 3 then cnt_3m else cnt_6m end as trade_count,
  (case when cnt_2m >= 3 then avg_2m when cnt_3m >= 3 then avg_3m else avg_6m end)::bigint as median_amount,
  (case when cnt_2m >= 3 then min_2m when cnt_3m >= 3 then min_3m else min_6m end)::bigint as min_amount,
  (case when cnt_2m >= 3 then max_2m when cnt_3m >= 3 then max_3m else max_6m end)::bigint as max_amount,
  case when cnt_2m >= 3 then '2개월' when cnt_3m >= 3 then '3개월' else '6개월' end as window_used,
  last_deal_date
from agg
where cnt_6m >= 3;

-- MV 인덱스 (concurrent refresh 가능하게 unique)
create unique index if not exists apt_repr_price_mv_natural
  on public.apt_representative_price_mv (apt_nm, lawd_cd, umd_nm, area_group);
create index if not exists apt_repr_price_mv_apt_lawd
  on public.apt_representative_price_mv (apt_nm, lawd_cd);

grant select on public.apt_representative_price_mv to anon, authenticated;

-- 기존 view 를 MV 를 가리키도록 교체 (호출 코드 수정 없이 적용)
drop view if exists public.apt_representative_price;
create view public.apt_representative_price as
  select * from public.apt_representative_price_mv;
grant select on public.apt_representative_price to anon, authenticated;

-- refresh 함수 — cron 일 1회 호출
create or replace function public.refresh_apt_representative_price()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.apt_representative_price_mv;
exception when feature_not_supported then
  -- 첫 refresh (인덱스 적재 전) 등 concurrent 실패 시 일반 refresh
  refresh materialized view public.apt_representative_price_mv;
end;
$$;
grant execute on function public.refresh_apt_representative_price() to service_role;

-- 2) apt_trades 인덱스 — 위 MV refresh 와 다른 ad-hoc 쿼리 가속
create index if not exists apt_trades_grp_idx
  on public.apt_trades (apt_nm, lawd_cd, dong);
create index if not exists apt_trades_date_idx
  on public.apt_trades (deal_year, deal_month, deal_day);

-- 3) apt_master 인덱스 — home-pins 의 (lat NOT NULL + household_count|occupier|listing) 필터 가속
create index if not exists apt_master_lat_household_idx
  on public.apt_master (household_count desc) where lat is not null;
create index if not exists apt_master_occupier_idx
  on public.apt_master (occupier_id) where occupier_id is not null;

-- 4) apt_listings 는 별로 안 큼 — 이미 apt_id PK 충분

notify pgrst, 'reload schema';
