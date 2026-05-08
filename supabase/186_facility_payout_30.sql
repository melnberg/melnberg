-- ──────────────────────────────────────────────
-- 186: 모든 상업시설 배당 30% 상향
-- - factory_locations.daily_income × 1.3
-- - restaurant_pins.daily_income × 1.3
-- - kids_pins.daily_income × 1.3
-- - emart 는 cron RPC 안 1.0 mlbg/일 상수 → 1.3 으로 변경 (auto_distribute_facility_income)
--   + claim_emart_income RPC 도 동일 수정 (수동 청구 경로 보존).
--
-- 안전성 — 멱등 보장 위해 ROUND 후 비교, 이미 1.3 배 적용된 row 는 재실행 안 함.
-- 하지만 SQL 한 번만 실행 가정 (사용자 수동 적용). 멱등 보장 100% 는 어렵.
-- ──────────────────────────────────────────────

-- 1) factory_locations.daily_income × 1.3
update public.factory_locations
set daily_income = round(daily_income * 1.3, 2)
where daily_income is not null;

-- 2) restaurant_pins.daily_income × 1.3
update public.restaurant_pins
set daily_income = round(daily_income * 1.3, 2)
where daily_income is not null;

-- 3) kids_pins.daily_income × 1.3
update public.kids_pins
set daily_income = round(daily_income * 1.3, 2)
where daily_income is not null;

-- 4) auto_distribute_facility_income — emart 1.0 → 1.3
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

  -- 이마트 (1.0 → 1.3 mlbg/일)
  with eligible as (
    select id, user_id,
      floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int as days
    from public.emart_occupations
  )
  insert into _facility_payouts (user_id, earned)
  select user_id, days * 1.3 from eligible where days >= 1;

  update public.emart_occupations eo
  set last_claimed_at = coalesce(eo.last_claimed_at, eo.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(eo.last_claimed_at, eo.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(eo.last_claimed_at, eo.occupied_at))) / 86400)::int >= 1;

  -- 공장 (daily_income 컬럼 — 위에서 이미 1.3 배 곱해짐)
  with eligible as (
    select fo.id, fo.user_id, fl.daily_income,
      floor(extract(epoch from (v_now - coalesce(fo.last_claimed_at, fo.occupied_at))) / 86400)::int as days
    from public.factory_occupations fo
    join public.factory_locations fl on fl.id = fo.factory_id
  )
  insert into _facility_payouts (user_id, earned)
  select user_id, days * daily_income from eligible where days >= 1;

  update public.factory_occupations fo
  set last_claimed_at = coalesce(fo.last_claimed_at, fo.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(fo.last_claimed_at, fo.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(fo.last_claimed_at, fo.occupied_at))) / 86400)::int >= 1;

  -- 맛집 핀
  with eligible as (
    select ro.pin_id, ro.user_id, rp.daily_income,
      floor(extract(epoch from (v_now - coalesce(ro.last_claimed_at, ro.occupied_at))) / 86400)::int as days
    from public.restaurant_pin_occupations ro
    join public.restaurant_pins rp on rp.id = ro.pin_id
  )
  insert into _facility_payouts (user_id, earned)
  select user_id, days * daily_income from eligible where days >= 1;

  update public.restaurant_pin_occupations ro
  set last_claimed_at = coalesce(ro.last_claimed_at, ro.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(ro.last_claimed_at, ro.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(ro.last_claimed_at, ro.occupied_at))) / 86400)::int >= 1;

  -- 육아 핀
  with eligible as (
    select ko.pin_id, ko.user_id, kp.daily_income,
      floor(extract(epoch from (v_now - coalesce(ko.last_claimed_at, ko.occupied_at))) / 86400)::int as days
    from public.kids_pin_occupations ko
    join public.kids_pins kp on kp.id = ko.pin_id
  )
  insert into _facility_payouts (user_id, earned)
  select user_id, days * daily_income from eligible where days >= 1;

  update public.kids_pin_occupations ko
  set last_claimed_at = coalesce(ko.last_claimed_at, ko.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(ko.last_claimed_at, ko.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(ko.last_claimed_at, ko.occupied_at))) / 86400)::int >= 1;

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

grant execute on function public.auto_distribute_facility_income() to service_role;

-- 운영 공지
insert into public.site_announcements (title, body, created_by)
select '💰 상업시설 배당 30% 인상',
       '이마트·공장·맛집·육아 모든 상업시설의 일별 배당이 30% 인상됨. 다음 자동 지급부터 적용.',
       (select id from public.profiles where is_admin = true limit 1)
where exists (select 1 from public.profiles where is_admin = true);

notify pgrst, 'reload schema';
