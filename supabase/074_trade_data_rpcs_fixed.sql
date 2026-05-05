-- ──────────────────────────────────────────────
-- 074: 070 재작성 — 실제 DB 스키마 (deal_year/month/day, cancel_deal_type, exclu_use_ar) 기준
-- 070 은 apt_seq/sgg_cd/cdeal_type/dealing_gbn 등 미존재 컬럼 다수 사용으로 적용 실패.
-- 매칭은 apt_nm + lawd_cd 만 사용.
-- ──────────────────────────────────────────────

-- ── A. 단지 패널 차트용 — 최근 N개월 거래 ──────────
drop function if exists public.get_apt_recent_trades(bigint, int);
create or replace function public.get_apt_recent_trades(p_apt_id bigint, p_months int default 12)
returns table(
  deal_date date,
  deal_amount bigint,
  excl_use_ar numeric,
  floor_no int,
  area_group int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_apt_nm text;
  v_lawd_cd text;
  v_threshold int;  -- yyyymm
begin
  select am.apt_nm, am.lawd_cd into v_apt_nm, v_lawd_cd
  from public.apt_master am where am.id = p_apt_id;
  if v_apt_nm is null then return; end if;

  v_threshold := extract(year from current_date - (p_months || ' months')::interval)::int * 100
               + extract(month from current_date - (p_months || ' months')::interval)::int;

  return query
  select
    make_date(t.deal_year::int, t.deal_month::int, greatest(t.deal_day::int, 1)) as deal_date,
    t.deal_amount,
    t.exclu_use_ar as excl_use_ar,
    t.floor::int as floor_no,
    (floor(t.exclu_use_ar / 5) * 5)::int as area_group
  from public.apt_trades t
  where (t.deal_year::int * 100 + t.deal_month::int) >= v_threshold
    and (t.cancel_deal_type is null or t.cancel_deal_type = '')
    and t.apt_nm = v_apt_nm
    and t.lawd_cd = v_lawd_cd
  order by t.deal_year asc, t.deal_month asc, t.deal_day asc;
end;
$$;
grant execute on function public.get_apt_recent_trades(bigint, int) to anon, authenticated;

-- ── A 보조 — 단지 통계 ───────────────────────────────
drop function if exists public.get_apt_trade_summary(bigint, int);
create or replace function public.get_apt_trade_summary(p_apt_id bigint, p_months int default 12)
returns table(
  total_count bigint,
  median_amount bigint,
  avg_amount bigint,
  min_amount bigint,
  max_amount bigint,
  last_deal_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_apt_nm text;
  v_lawd_cd text;
  v_threshold int;
begin
  select am.apt_nm, am.lawd_cd into v_apt_nm, v_lawd_cd
  from public.apt_master am where am.id = p_apt_id;
  if v_apt_nm is null then return; end if;

  v_threshold := extract(year from current_date - (p_months || ' months')::interval)::int * 100
               + extract(month from current_date - (p_months || ' months')::interval)::int;

  return query
  select
    count(*)::bigint,
    (percentile_cont(0.5) within group (order by t.deal_amount))::bigint,
    (avg(t.deal_amount))::bigint,
    min(t.deal_amount),
    max(t.deal_amount),
    max(make_date(t.deal_year::int, t.deal_month::int, greatest(t.deal_day::int, 1)))
  from public.apt_trades t
  where (t.deal_year::int * 100 + t.deal_month::int) >= v_threshold
    and (t.cancel_deal_type is null or t.cancel_deal_type = '')
    and (t.floor is null or t.floor::int <> 1)
    and t.apt_nm = v_apt_nm
    and t.lawd_cd = v_lawd_cd;
end;
$$;
grant execute on function public.get_apt_trade_summary(bigint, int) to anon, authenticated;

-- ── B. 홈 마퀴용 — 최근 거래 highlights (7일) ──────────
drop function if exists public.get_recent_trade_highlights(int);
create or replace function public.get_recent_trade_highlights(p_limit int default 20)
returns table(
  apt_nm text,
  deal_amount bigint,
  excl_use_ar numeric,
  deal_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_threshold int;  -- yyyymm 또는 yyyymmdd
begin
  -- 최근 7일 = 이번달 + 지난달 일부 (yyyymm 기준 2개월)
  v_threshold := extract(year from current_date - interval '7 days')::int * 10000
               + extract(month from current_date - interval '7 days')::int * 100
               + extract(day from current_date - interval '7 days')::int;

  return query
  select
    t.apt_nm,
    t.deal_amount,
    t.exclu_use_ar,
    make_date(t.deal_year::int, t.deal_month::int, greatest(t.deal_day::int, 1)) as deal_date
  from public.apt_trades t
  where (t.deal_year::int * 10000 + t.deal_month::int * 100 + greatest(t.deal_day::int, 1)) >= v_threshold
    and (t.cancel_deal_type is null or t.cancel_deal_type = '')
  order by t.deal_amount desc, t.deal_year desc, t.deal_month desc, t.deal_day desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;
grant execute on function public.get_recent_trade_highlights(int) to anon, authenticated;

-- ── D. 가장 많이 거래된 단지 TOP N ──────────
drop function if exists public.get_most_traded_apts(int, int);
create or replace function public.get_most_traded_apts(p_months int default 3, p_limit int default 10)
returns table(
  apt_id bigint,
  apt_nm text,
  trade_count bigint,
  median_amount bigint,
  last_deal_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_threshold int;
begin
  v_threshold := extract(year from current_date - (p_months || ' months')::interval)::int * 100
               + extract(month from current_date - (p_months || ' months')::interval)::int;

  return query
  with grouped as (
    select
      t.apt_nm,
      t.lawd_cd,
      count(*)::bigint as trade_count,
      (percentile_cont(0.5) within group (order by t.deal_amount))::bigint as median_amount,
      max(make_date(t.deal_year::int, t.deal_month::int, greatest(t.deal_day::int, 1))) as last_deal_date
    from public.apt_trades t
    where (t.deal_year::int * 100 + t.deal_month::int) >= v_threshold
      and (t.cancel_deal_type is null or t.cancel_deal_type = '')
    group by t.apt_nm, t.lawd_cd
  ),
  joined as (
    select g.*, am.id as apt_id
    from grouped g
    left join lateral (
      select id from public.apt_master am
      where am.apt_nm = g.apt_nm and am.lawd_cd = g.lawd_cd
      limit 1
    ) am on true
  )
  select j.apt_id, j.apt_nm, j.trade_count, j.median_amount, j.last_deal_date
  from joined j
  where j.trade_count >= 2 and j.apt_id is not null
  order by j.trade_count desc, j.last_deal_date desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;
grant execute on function public.get_most_traded_apts(int, int) to anon, authenticated;

-- ── C. 단지 비교용 — 여러 단지 한 번에 ──────────────
drop function if exists public.get_apts_compare(bigint[]);
create or replace function public.get_apts_compare(p_apt_ids bigint[])
returns table(
  apt_id bigint,
  apt_nm text,
  dong text,
  lawd_cd text,
  household_count int,
  building_count int,
  kapt_build_year int,
  geocoded_address text,
  listing_price int,
  recent_median bigint,
  recent_count bigint,
  occupier_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_threshold int;
begin
  v_threshold := extract(year from current_date - interval '6 months')::int * 100
               + extract(month from current_date - interval '6 months')::int;

  return query
  select
    am.id as apt_id,
    am.apt_nm,
    am.dong,
    am.lawd_cd,
    am.household_count,
    am.building_count,
    am.kapt_build_year,
    am.geocoded_address,
    null::int as listing_price,
    (
      select (percentile_cont(0.5) within group (order by t.deal_amount))::bigint
      from public.apt_trades t
      where (t.deal_year::int * 100 + t.deal_month::int) >= v_threshold
        and (t.cancel_deal_type is null or t.cancel_deal_type = '')
        and t.apt_nm = am.apt_nm and t.lawd_cd = am.lawd_cd
    ) as recent_median,
    (
      select count(*)::bigint
      from public.apt_trades t
      where (t.deal_year::int * 100 + t.deal_month::int) >= v_threshold
        and (t.cancel_deal_type is null or t.cancel_deal_type = '')
        and t.apt_nm = am.apt_nm and t.lawd_cd = am.lawd_cd
    ) as recent_count,
    am.occupier_id
  from public.apt_master am
  where am.id = any(p_apt_ids);
end;
$$;
grant execute on function public.get_apts_compare(bigint[]) to anon, authenticated;

notify pgrst, 'reload schema';
