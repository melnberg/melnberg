-- ──────────────────────────────────────────────
-- 017: 시세 산출 정책 개정 — 짧은 윈도우 평균 + 점진 확장
-- 변경: 6개월 중앙값 → 2개월 평균 (부족 시 3개월, 그래도 부족 시 6개월)
-- 이유: 급상승 장에서는 6개월 윈도우가 현재 시세 반영 못함
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

create or replace view public.apt_representative_price as
with valid_trades as (
  -- 산출 모집단 — 직거래·해제거래·1층 제외, 최근 6개월 한정
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
  apt_nm,
  lawd_cd,
  umd_nm,
  area_group,
  -- 윈도우 우선순위: 2개월(3건+) → 3개월(3건+) → 6개월
  case
    when cnt_2m >= 3 then cnt_2m
    when cnt_3m >= 3 then cnt_3m
    else cnt_6m
  end as trade_count,
  (case
    when cnt_2m >= 3 then avg_2m
    when cnt_3m >= 3 then avg_3m
    else avg_6m
  end)::bigint as median_amount,  -- 컬럼명 호환성 유지 (실제는 평균)
  (case
    when cnt_2m >= 3 then min_2m
    when cnt_3m >= 3 then min_3m
    else min_6m
  end)::bigint as min_amount,
  (case
    when cnt_2m >= 3 then max_2m
    when cnt_3m >= 3 then max_3m
    else max_6m
  end)::bigint as max_amount,
  case
    when cnt_2m >= 3 then '2개월'
    when cnt_3m >= 3 then '3개월'
    else '6개월'
  end as window_used,
  last_deal_date
from agg
where cnt_6m >= 3;  -- 6개월 내 3건 이상 거래 있는 단지만 산출
