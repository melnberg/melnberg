-- ──────────────────────────────────────────────
-- 070: 실거래가 데이터 공개 RPC (A·B·D·C 작업용)
-- apt_trades 는 admin RLS 라 가공 RPC 만 일반 사용자에 노출.
-- umd_nm 컬럼 미존재 환경도 호환 — 거기에 의존하지 않음.
-- ──────────────────────────────────────────────

-- ── A. 단지 패널 차트용 — 최근 12개월 거래 ──────────
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
  v_apt_seq text;
  v_apt_nm text;
  v_lawd_cd text;
begin
  select coalesce(am.apt_seq, '')::text, am.apt_nm, am.lawd_cd
    into v_apt_seq, v_apt_nm, v_lawd_cd
    from public.apt_master am where am.id = p_apt_id;
  if v_apt_nm is null then return; end if;

  return query
  select
    t.deal_date,
    t.deal_amount,
    t.excl_use_ar,
    t.floor as floor_no,
    (floor(t.excl_use_ar / 5) * 5)::int as area_group
  from public.apt_trades t
  where t.deal_date >= (current_date - (p_months || ' months')::interval)
    and (t.cdeal_type is null or t.cdeal_type = '')
    and (
      (v_apt_seq <> '' and t.apt_seq = v_apt_seq)
      or (v_apt_seq = '' and t.apt_nm = v_apt_nm and t.sgg_cd = v_lawd_cd)
    )
  order by t.deal_date asc;
end;
$$;
grant execute on function public.get_apt_recent_trades(bigint, int) to anon, authenticated;

-- ── A 보조 — 단지 통계 ───────────────────────────────
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
  v_apt_seq text;
  v_apt_nm text;
  v_lawd_cd text;
begin
  select coalesce(am.apt_seq, '')::text, am.apt_nm, am.lawd_cd
    into v_apt_seq, v_apt_nm, v_lawd_cd
    from public.apt_master am where am.id = p_apt_id;
  if v_apt_nm is null then return; end if;

  return query
  select
    count(*)::bigint,
    (percentile_cont(0.5) within group (order by t.deal_amount))::bigint,
    (avg(t.deal_amount))::bigint,
    min(t.deal_amount),
    max(t.deal_amount),
    max(t.deal_date)
  from public.apt_trades t
  where t.deal_date >= (current_date - (p_months || ' months')::interval)
    and (t.cdeal_type is null or t.cdeal_type = '')
    and (t.dealing_gbn is null or t.dealing_gbn <> '직거래')
    and (t.floor is null or t.floor <> 1)
    and (
      (v_apt_seq <> '' and t.apt_seq = v_apt_seq)
      or (v_apt_seq = '' and t.apt_nm = v_apt_nm and t.sgg_cd = v_lawd_cd)
    );
end;
$$;
grant execute on function public.get_apt_trade_summary(bigint, int) to anon, authenticated;

-- ── B. 홈 마퀴용 — 최근 거래 highlights (umd_nm 제거) ──
create or replace function public.get_recent_trade_highlights(p_limit int default 20)
returns table(
  apt_nm text,
  deal_amount bigint,
  excl_use_ar numeric,
  deal_date date
)
language sql
stable
security definer
set search_path = public
as $$
  select t.apt_nm, t.deal_amount, t.excl_use_ar, t.deal_date
  from public.apt_trades t
  where t.deal_date >= (current_date - interval '7 days')
    and (t.cdeal_type is null or t.cdeal_type = '')
    and (t.dealing_gbn is null or t.dealing_gbn <> '직거래')
  order by t.deal_amount desc, t.deal_date desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
grant execute on function public.get_recent_trade_highlights(int) to anon, authenticated;

-- ── D. 가장 많이 거래된 단지 TOP N (3개월) ──────────
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
begin
  return query
  with grouped as (
    select
      coalesce(t.apt_seq, '') as apt_seq_key,
      max(t.apt_nm) as apt_nm,
      max(t.sgg_cd) as sgg_cd,
      count(*)::bigint as trade_count,
      (percentile_cont(0.5) within group (order by t.deal_amount))::bigint as median_amount,
      max(t.deal_date) as last_deal_date
    from public.apt_trades t
    where t.deal_date >= (current_date - (p_months || ' months')::interval)
      and (t.cdeal_type is null or t.cdeal_type = '')
      and (t.dealing_gbn is null or t.dealing_gbn <> '직거래')
    group by 1
  ),
  joined as (
    select g.*, am.id as apt_id
    from grouped g
    left join lateral (
      select id from public.apt_master am
      where (g.apt_seq_key <> '' and am.apt_seq = g.apt_seq_key)
         or (g.apt_seq_key = '' and am.apt_nm = g.apt_nm and am.lawd_cd = g.sgg_cd)
      limit 1
    ) am on true
  )
  select j.apt_id, j.apt_nm, j.trade_count, j.median_amount, j.last_deal_date
  from joined j
  where j.trade_count >= 2
  order by j.trade_count desc, j.last_deal_date desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;
grant execute on function public.get_most_traded_apts(int, int) to anon, authenticated;

-- ── C. 단지 비교용 — 여러 단지 한 번에 ──────────────
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
language sql
stable
security definer
set search_path = public
as $$
  select
    am.id as apt_id,
    am.apt_nm,
    am.dong,
    am.lawd_cd,
    am.household_count,
    am.building_count,
    am.kapt_build_year,
    am.geocoded_address,
    public.get_apt_listing_price(am.lawd_cd) as listing_price,
    (
      select (percentile_cont(0.5) within group (order by t.deal_amount))::bigint
      from public.apt_trades t
      where t.deal_date >= (current_date - interval '6 months')
        and (t.cdeal_type is null or t.cdeal_type = '')
        and (t.dealing_gbn is null or t.dealing_gbn <> '직거래')
        and (
          (am.apt_seq is not null and t.apt_seq = am.apt_seq)
          or (am.apt_seq is null and t.apt_nm = am.apt_nm and t.sgg_cd = am.lawd_cd)
        )
    ) as recent_median,
    (
      select count(*)::bigint
      from public.apt_trades t
      where t.deal_date >= (current_date - interval '6 months')
        and (t.cdeal_type is null or t.cdeal_type = '')
        and (
          (am.apt_seq is not null and t.apt_seq = am.apt_seq)
          or (am.apt_seq is null and t.apt_nm = am.apt_nm and t.sgg_cd = am.lawd_cd)
        )
    ) as recent_count,
    am.occupier_id
  from public.apt_master am
  where am.id = any(p_apt_ids);
$$;
grant execute on function public.get_apts_compare(bigint[]) to anon, authenticated;
