-- ──────────────────────────────────────────────
-- 195: 이마트 일배당 = 분양가(5 mlbg) 의 10% = 0.5 mlbg/일
-- 160 의 auto_distribute_facility_income() 의 emart 1.0 → 0.5 만 변경.
-- 다른 시설(factory/restaurant/kids) 로직은 동일.
-- claim_emart_income (081) 의 1 mlbg 도 0.5 로 같이 맞춤.
-- ──────────────────────────────────────────────

-- 1) 일별 자동 분배 — 이마트 1.0 → 0.5
drop function if exists public.auto_distribute_facility_income();
create or replace function public.auto_distribute_facility_income()
returns table(out_total_recipients int, out_total_paid numeric, out_notifications_sent int)
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_total_recipients int := 0;
  v_total_paid numeric := 0;
  v_notifications_sent int := 0;
begin
  create temp table _facility_payouts (
    user_id uuid not null,
    earned numeric not null
  ) on commit drop;

  -- 1) 이마트 — 0.5 mlbg/일 (분양가 5의 10%)
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    eo.user_id,
    'emart'::text,
    null::bigint,
    (current_date - days + g.i)::date,
    0.5
  from (
    select user_id,
      floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int as days
    from public.emart_occupations
  ) eo
  cross join lateral generate_series(1, eo.days) g(i)
  where eo.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select user_id,
    floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int * 0.5
  from public.emart_occupations
  where floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int >= 1;

  update public.emart_occupations eo
  set last_claimed_at = coalesce(eo.last_claimed_at, eo.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(eo.last_claimed_at, eo.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(eo.last_claimed_at, eo.occupied_at))) / 86400)::int >= 1;

  -- 2) 공장 (다중 보유, fl.daily_income — 194 에서 occupy_price*0.10 로 갱신됨)
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    fo.user_id,
    'factory'::text,
    fo.factory_id,
    (current_date - fo.days + g.i)::date,
    fl.daily_income
  from (
    select id, user_id, factory_id,
      floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int as days
    from public.factory_occupations
  ) fo
  join public.factory_locations fl on fl.id = fo.factory_id
  cross join lateral generate_series(1, fo.days) g(i)
  where fo.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select fo.user_id,
    floor(extract(epoch from (v_now - coalesce(fo.last_claimed_at, fo.occupied_at))) / 86400)::int * fl.daily_income
  from public.factory_occupations fo
  join public.factory_locations fl on fl.id = fo.factory_id
  where floor(extract(epoch from (v_now - coalesce(fo.last_claimed_at, fo.occupied_at))) / 86400)::int >= 1;

  update public.factory_occupations fo
  set last_claimed_at = coalesce(fo.last_claimed_at, fo.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(fo.last_claimed_at, fo.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(fo.last_claimed_at, fo.occupied_at))) / 86400)::int >= 1;

  -- 3) 맛집 (다중 보유, rp.daily_income)
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    ro.user_id,
    'restaurant'::text,
    ro.pin_id,
    (current_date - ro.days + g.i)::date,
    rp.daily_income
  from (
    select pin_id, user_id, occupied_at, last_claimed_at,
      floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int as days
    from public.restaurant_pin_occupations
  ) ro
  join public.restaurant_pins rp on rp.id = ro.pin_id
  cross join lateral generate_series(1, ro.days) g(i)
  where ro.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select ro.user_id,
    floor(extract(epoch from (v_now - coalesce(ro.last_claimed_at, ro.occupied_at))) / 86400)::int * rp.daily_income
  from public.restaurant_pin_occupations ro
  join public.restaurant_pins rp on rp.id = ro.pin_id
  where floor(extract(epoch from (v_now - coalesce(ro.last_claimed_at, ro.occupied_at))) / 86400)::int >= 1;

  update public.restaurant_pin_occupations ro
  set last_claimed_at = coalesce(ro.last_claimed_at, ro.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(ro.last_claimed_at, ro.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(ro.last_claimed_at, ro.occupied_at))) / 86400)::int >= 1;

  -- 4) 육아 (다중 보유, kp.daily_income)
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    ko.user_id,
    'kids'::text,
    ko.pin_id,
    (current_date - ko.days + g.i)::date,
    kp.daily_income
  from (
    select pin_id, user_id, occupied_at, last_claimed_at,
      floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int as days
    from public.kids_pin_occupations
  ) ko
  join public.kids_pins kp on kp.id = ko.pin_id
  cross join lateral generate_series(1, ko.days) g(i)
  where ko.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select ko.user_id,
    floor(extract(epoch from (v_now - coalesce(ko.last_claimed_at, ko.occupied_at))) / 86400)::int * kp.daily_income
  from public.kids_pin_occupations ko
  join public.kids_pins kp on kp.id = ko.pin_id
  where floor(extract(epoch from (v_now - coalesce(ko.last_claimed_at, ko.occupied_at))) / 86400)::int >= 1;

  update public.kids_pin_occupations ko
  set last_claimed_at = coalesce(ko.last_claimed_at, ko.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(ko.last_claimed_at, ko.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(ko.last_claimed_at, ko.occupied_at))) / 86400)::int >= 1;

  -- 합산 → 잔액 + 알림
  with agg as (
    select user_id, round(sum(earned)::numeric, 2) as total
    from _facility_payouts
    group by user_id
    having sum(earned) > 0
  ),
  upd as (
    update public.profiles p
    set mlbg_balance = coalesce(p.mlbg_balance, 0) + a.total
    from agg a
    where p.id = a.user_id
    returning a.user_id, a.total
  )
  insert into public.notifications (recipient_id, type, comment_excerpt, actor_name)
  select user_id,
         'facility_income_auto',
         '상업시설 일별 수익 자동 지급: +' || total::text || ' mlbg',
         '시스템'
  from upd;

  get diagnostics v_notifications_sent = row_count;

  select count(distinct user_id)::int, coalesce(sum(earned), 0)::numeric
    into v_total_recipients, v_total_paid
  from _facility_payouts;

  return query select v_total_recipients, v_total_paid, v_notifications_sent;
end;
$$;

grant execute on function public.auto_distribute_facility_income() to service_role, authenticated;

-- 2) claim_emart_income (사용자가 직접 호출하는 RPC가 있다면) 도 1 → 0.5
create or replace function public.claim_emart_income()
returns table(out_earned numeric, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_days int;
  v_earned numeric;
  v_now timestamptz := now();
begin
  if v_uid is null then return query select 0::numeric, '로그인 필요'::text; return; end if;

  select floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int
    into v_days
  from public.emart_occupations
  where user_id = v_uid;

  if v_days is null then return query select 0::numeric, '이마트 보유 X'::text; return; end if;
  if v_days < 1 then return query select 0::numeric, '24시간 안 지남'::text; return; end if;

  v_earned := v_days * 0.5;

  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_earned where id = v_uid;
  update public.emart_occupations
    set last_claimed_at = coalesce(last_claimed_at, occupied_at) + (v_days || ' days')::interval
    where user_id = v_uid;

  return query select v_earned, ('+ ' || v_earned || ' mlbg (' || v_days || '일)')::text;
end;
$$;
grant execute on function public.claim_emart_income() to authenticated;

notify pgrst, 'reload schema';
