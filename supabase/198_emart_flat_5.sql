-- ──────────────────────────────────────────────
-- 198: 이마트 일배당 0.5 → 5 mlbg 정액 (분양가 무관)
-- 197 의 emart 0.5 만 5 로 변경. 다른 시설(factory/restaurant/kids)은 그대로 10% 룰 유지.
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

  -- 1) 이마트 — 정액 5 mlbg/일 (분양가 무관)
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

  -- 2) 공장/시설 (fl.daily_income — 194 에서 occupy_price*0.10)
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
  '시설 배당 자동 정산 (198): 이마트 정액 5/일 + 나머지 10% 룰. 멱등.';

-- claim_emart_income (사용자 수동 호출용) — 5 mlbg/일로 같이 맞춤
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

  v_earned := v_days * 5;

  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_earned where id = v_uid;
  update public.emart_occupations
    set last_claimed_at = coalesce(last_claimed_at, occupied_at) + (v_days || ' days')::interval
    where user_id = v_uid;

  return query select v_earned, ('+ ' || v_earned || ' mlbg (' || v_days || '일)')::text;
end;
$$;
grant execute on function public.claim_emart_income() to authenticated;

notify pgrst, 'reload schema';
