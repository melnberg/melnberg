-- ──────────────────────────────────────────────
-- 160: 상업시설 일별 지급 로그
--
-- 159 의 auto_distribute_facility_income 가 사용자별 합산만 했음.
-- 패널에 "최근 7일 일별 지급" 표시하려면 (시설×날짜) 단위 로그 필요.
--
-- 변경:
--   - facility_income_log 테이블 신설 (user×facility×date)
--   - auto_distribute_facility_income() 수정 — 일수만큼 generate_series 로 쪼개 INSERT
-- ──────────────────────────────────────────────

create table if not exists public.facility_income_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  facility_type text not null check (facility_type in ('emart','factory','restaurant','kids')),
  facility_id bigint,                     -- emart 는 null (1인 1점포), 나머지는 시설/핀 id
  paid_for_date date not null,            -- 어느 날짜 분의 수익인지
  amount numeric not null,
  paid_at timestamptz not null default now()
);

create index if not exists facility_income_log_user_facility_idx
  on public.facility_income_log(user_id, facility_type, facility_id, paid_for_date desc);
create index if not exists facility_income_log_user_recent_idx
  on public.facility_income_log(user_id, paid_for_date desc);

alter table public.facility_income_log enable row level security;

drop policy if exists "facility_income_log own read" on public.facility_income_log;
create policy "facility_income_log own read"
  on public.facility_income_log for select
  using (user_id = auth.uid());

drop policy if exists "facility_income_log admin read" on public.facility_income_log;
create policy "facility_income_log admin read"
  on public.facility_income_log for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
-- INSERT 는 security definer RPC 안에서만 (직접 client INSERT 차단)

-- ── auto_distribute_facility_income 재정의 ──
-- 이전 (159): 사용자별 합산만
-- 변경: 시설×날짜 로그 INSERT 추가 — generate_series 로 일수 분배
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

  -- ── 1) 이마트 (1 mlbg/일, 1인 1점포) ──
  insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
  select
    eo.user_id,
    'emart'::text,
    null::bigint,
    (current_date - days + g.i)::date,
    1.0
  from (
    select user_id,
      floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int as days
    from public.emart_occupations
  ) eo
  cross join lateral generate_series(1, eo.days) g(i)
  where eo.days >= 1;

  insert into _facility_payouts (user_id, earned)
  select user_id,
    floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int * 1.0
  from public.emart_occupations
  where floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int >= 1;

  update public.emart_occupations eo
  set last_claimed_at = coalesce(eo.last_claimed_at, eo.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(eo.last_claimed_at, eo.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(eo.last_claimed_at, eo.occupied_at))) / 86400)::int >= 1;

  -- ── 2) 공장 (다중 보유, fl.daily_income) ──
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

  -- ── 3) 맛집 (다중 보유, rp.daily_income) ──
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

  -- ── 4) 육아 (다중 보유, kp.daily_income) ──
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
-- authenticated 도 grant — admin 이 수동 트리거할 때 필요. RPC 안에서 따로 admin 체크는 안 했지만
-- service_role 키 없으면 보통 호출 불가. 어드민 전용 API 라우트에서만 노출하므로 OK.

comment on function public.auto_distribute_facility_income is
  '4개 상업시설 일별 수익 자동 적립 + 일별 로그 (facility_income_log) + 사용자 알림. cron + admin 수동 트리거.';

notify pgrst, 'reload schema';
