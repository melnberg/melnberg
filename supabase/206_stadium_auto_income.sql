-- ──────────────────────────────────────────────
-- 206: 경기장 핀 일배당 자동 정산 — auto_distribute_facility_income 에 stadium 단계 추가
-- 198 의 함수 그대로 + stadium 단계 (5단계) + last_claimed_at 갱신.
-- 멱등 보장: ON CONFLICT DO NOTHING (facility_income_log 유니크 키).
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
  create temp table _newly_paid (
    user_id uuid not null,
    amount numeric not null
  ) on commit drop;

  -- 1) 이마트 — 정액 5 mlbg/일
  with ins as (
    insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
    select user_id, 'emart', null, v_today_kst, 5
    from public.emart_occupations
    on conflict (user_id, facility_type, paid_for_date)
      where facility_id is null
      do nothing
    returning user_id, amount
  )
  insert into _newly_paid (user_id, amount) select user_id, amount from ins;

  -- 2) 공장/시설
  with ins as (
    insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
    select fo.user_id, 'factory', fo.factory_id, v_today_kst, fl.daily_income
    from public.factory_occupations fo
    join public.factory_locations fl on fl.id = fo.factory_id
    on conflict (user_id, facility_type, facility_id, paid_for_date)
      where facility_id is not null
      do nothing
    returning user_id, amount
  )
  insert into _newly_paid (user_id, amount) select user_id, amount from ins;

  -- 3) 맛집
  with ins as (
    insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
    select ro.user_id, 'restaurant', ro.pin_id, v_today_kst, rp.daily_income
    from public.restaurant_pin_occupations ro
    join public.restaurant_pins rp on rp.id = ro.pin_id
    on conflict (user_id, facility_type, facility_id, paid_for_date)
      where facility_id is not null
      do nothing
    returning user_id, amount
  )
  insert into _newly_paid (user_id, amount) select user_id, amount from ins;

  -- 4) 육아
  with ins as (
    insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
    select ko.user_id, 'kids', ko.pin_id, v_today_kst, kp.daily_income
    from public.kids_pin_occupations ko
    join public.kids_pins kp on kp.id = ko.pin_id
    on conflict (user_id, facility_type, facility_id, paid_for_date)
      where facility_id is not null
      do nothing
    returning user_id, amount
  )
  insert into _newly_paid (user_id, amount) select user_id, amount from ins;

  -- 5) 경기장 — stadium_pin_occupations × stadium_pins.daily_income (현재 시드는 일 3)
  with ins as (
    insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
    select so.user_id, 'stadium', so.pin_id, v_today_kst, sp.daily_income
    from public.stadium_pin_occupations so
    join public.stadium_pins sp on sp.id = so.pin_id
    on conflict (user_id, facility_type, facility_id, paid_for_date)
      where facility_id is not null
      do nothing
    returning user_id, amount
  )
  insert into _newly_paid (user_id, amount) select user_id, amount from ins;

  update public.emart_occupations o set last_claimed_at = v_now
    where exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id and l.facility_type = 'emart' and l.paid_for_date = v_today_kst);
  update public.factory_occupations o set last_claimed_at = v_now
    where exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id and l.facility_type = 'factory' and l.facility_id = o.factory_id and l.paid_for_date = v_today_kst);
  update public.restaurant_pin_occupations o set last_claimed_at = v_now
    where exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id and l.facility_type = 'restaurant' and l.facility_id = o.pin_id and l.paid_for_date = v_today_kst);
  update public.kids_pin_occupations o set last_claimed_at = v_now
    where exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id and l.facility_type = 'kids' and l.facility_id = o.pin_id and l.paid_for_date = v_today_kst);
  update public.stadium_pin_occupations o set last_claimed_at = v_now
    where exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id and l.facility_type = 'stadium' and l.facility_id = o.pin_id and l.paid_for_date = v_today_kst);

  with agg as (
    select user_id, round(sum(amount)::numeric, 2) as total
    from _newly_paid
    group by user_id
    having sum(amount) > 0
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
         '💰 오늘 시설 배당 +' || total::text || ' mlbg 입금됐어요',
         '시스템'
  from upd;

  get diagnostics v_notifications_sent = row_count;

  select count(distinct user_id)::int, coalesce(sum(amount), 0)::numeric
    into v_total_recipients, v_total_paid
  from _newly_paid;

  return query select v_total_recipients, v_total_paid, v_notifications_sent;
end;
$$;

grant execute on function public.auto_distribute_facility_income() to service_role, authenticated;
comment on function public.auto_distribute_facility_income is
  '시설 배당 자동 정산 (206): 198 + 경기장(stadium) 단계 추가. 멱등.';

notify pgrst, 'reload schema';
