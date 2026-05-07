-- ──────────────────────────────────────────────
-- 162: 시설 수익 일수 계산 — 24시간 → KST 날짜 차이 기준
--
-- 이전 (159, 160): floor((now - last_claimed) / 86400)
--   24시간 단위라 어제 23:00 분양 → 오늘 09:00 cron 시 0일 (10시간 부족) → 미지급.
--   "어제 분양받은 시설은 오늘 1일 분 받아야지" 라는 자연스러운 기대와 어긋남.
--
-- 변경: KST 날짜 차이 기준
--   v_days = today_kst - last_claim_kst (date 차이)
--   어제 11:55 분양 → 오늘 (날짜 1 차이) → 1일 분 즉시 지급.
--   같은 날 두 번 호출되면 0 반환 (멱등성 보장).
-- ──────────────────────────────────────────────

drop function if exists public.auto_distribute_facility_income();
create or replace function public.auto_distribute_facility_income()
returns table(out_total_recipients int, out_total_paid numeric, out_notifications_sent int)
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_today_kst date := (v_now at time zone 'Asia/Seoul')::date;
  v_total_recipients int := 0;
  v_total_paid numeric := 0;
  v_notifications_sent int := 0;
begin
  create temp table _facility_payouts (
    user_id uuid not null,
    earned numeric not null
  ) on commit drop;

  -- ── 1) 이마트 ──
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    eo.user_id, 'emart'::text, null::bigint,
    (v_today_kst - eo.days + g.i)::date, 1.0
  from (
    select user_id, last_claimed_at, occupied_at,
      (v_today_kst - (coalesce(last_claimed_at, occupied_at) at time zone 'Asia/Seoul')::date) as days
    from public.emart_occupations
  ) eo
  cross join lateral generate_series(1, eo.days) g(i)
  where eo.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select user_id,
    (v_today_kst - (coalesce(last_claimed_at, occupied_at) at time zone 'Asia/Seoul')::date) * 1.0
  from public.emart_occupations
  where (v_today_kst - (coalesce(last_claimed_at, occupied_at) at time zone 'Asia/Seoul')::date) >= 1;

  update public.emart_occupations eo
  set last_claimed_at = v_now
  where (v_today_kst - (coalesce(eo.last_claimed_at, eo.occupied_at) at time zone 'Asia/Seoul')::date) >= 1;

  -- ── 2) 공장 ──
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    fo.user_id, 'factory'::text, fo.factory_id,
    (v_today_kst - fo.days + g.i)::date, fl.daily_income
  from (
    select id, user_id, factory_id, last_claimed_at, occupied_at,
      (v_today_kst - (coalesce(last_claimed_at, occupied_at) at time zone 'Asia/Seoul')::date) as days
    from public.factory_occupations
  ) fo
  join public.factory_locations fl on fl.id = fo.factory_id
  cross join lateral generate_series(1, fo.days) g(i)
  where fo.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select fo.user_id,
    (v_today_kst - (coalesce(fo.last_claimed_at, fo.occupied_at) at time zone 'Asia/Seoul')::date) * fl.daily_income
  from public.factory_occupations fo
  join public.factory_locations fl on fl.id = fo.factory_id
  where (v_today_kst - (coalesce(fo.last_claimed_at, fo.occupied_at) at time zone 'Asia/Seoul')::date) >= 1;

  update public.factory_occupations fo
  set last_claimed_at = v_now
  where (v_today_kst - (coalesce(fo.last_claimed_at, fo.occupied_at) at time zone 'Asia/Seoul')::date) >= 1;

  -- ── 3) 맛집 ──
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    ro.user_id, 'restaurant'::text, ro.pin_id,
    (v_today_kst - ro.days + g.i)::date, rp.daily_income
  from (
    select pin_id, user_id, last_claimed_at, occupied_at,
      (v_today_kst - (coalesce(last_claimed_at, occupied_at) at time zone 'Asia/Seoul')::date) as days
    from public.restaurant_pin_occupations
  ) ro
  join public.restaurant_pins rp on rp.id = ro.pin_id
  cross join lateral generate_series(1, ro.days) g(i)
  where ro.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select ro.user_id,
    (v_today_kst - (coalesce(ro.last_claimed_at, ro.occupied_at) at time zone 'Asia/Seoul')::date) * rp.daily_income
  from public.restaurant_pin_occupations ro
  join public.restaurant_pins rp on rp.id = ro.pin_id
  where (v_today_kst - (coalesce(ro.last_claimed_at, ro.occupied_at) at time zone 'Asia/Seoul')::date) >= 1;

  update public.restaurant_pin_occupations ro
  set last_claimed_at = v_now
  where (v_today_kst - (coalesce(ro.last_claimed_at, ro.occupied_at) at time zone 'Asia/Seoul')::date) >= 1;

  -- ── 4) 육아 ──
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    ko.user_id, 'kids'::text, ko.pin_id,
    (v_today_kst - ko.days + g.i)::date, kp.daily_income
  from (
    select pin_id, user_id, last_claimed_at, occupied_at,
      (v_today_kst - (coalesce(last_claimed_at, occupied_at) at time zone 'Asia/Seoul')::date) as days
    from public.kids_pin_occupations
  ) ko
  join public.kids_pins kp on kp.id = ko.pin_id
  cross join lateral generate_series(1, ko.days) g(i)
  where ko.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select ko.user_id,
    (v_today_kst - (coalesce(ko.last_claimed_at, ko.occupied_at) at time zone 'Asia/Seoul')::date) * kp.daily_income
  from public.kids_pin_occupations ko
  join public.kids_pins kp on kp.id = ko.pin_id
  where (v_today_kst - (coalesce(ko.last_claimed_at, ko.occupied_at) at time zone 'Asia/Seoul')::date) >= 1;

  update public.kids_pin_occupations ko
  set last_claimed_at = v_now
  where (v_today_kst - (coalesce(ko.last_claimed_at, ko.occupied_at) at time zone 'Asia/Seoul')::date) >= 1;

  -- 사용자별 합산 → balance + 알림
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
comment on function public.auto_distribute_facility_income is
  '상업시설 일별 수익 자동 지급. KST 날짜 차이 기준 (162). 같은 날 두 번 호출돼도 멱등.';

notify pgrst, 'reload schema';
