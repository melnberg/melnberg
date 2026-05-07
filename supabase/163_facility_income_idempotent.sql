-- ──────────────────────────────────────────────
-- 163: 시설 수익 — 멱등 지급 (per-day, per-facility unique)
--
-- 162 까지: KST 날짜 차이만큼 N일 분 지급. 새로 분양받은 시설은 첫 날 못 받음.
-- 사용자 요구: "오늘 배당 됐다고 알림만 가면 됨" — 분양 직후라도 오늘 1일 분 지급.
--
-- 변경: 각 cron/관리자 실행 = "오늘 (KST) 1일치 적립" — 시설별 1번만 (per user).
-- 중복은 DB unique 제약으로 차단 → ON CONFLICT DO NOTHING.
-- 어제 분량은 어제 cron 이 처리했어야 함 (없으면 그 날 손실, 백필 X).
--
-- NOTE: 160 안 돌렸을 때를 대비해 facility_income_log 테이블·정책도 여기서 보장 (idempotent).
-- ──────────────────────────────────────────────

-- 160 에서 만들었어야 할 테이블 — 단독 실행 보장 (이미 있으면 skip)
create table if not exists public.facility_income_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  facility_type text not null check (facility_type in ('emart','factory','restaurant','kids')),
  facility_id bigint,
  paid_for_date date not null,
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
  on public.facility_income_log for select using (user_id = auth.uid());
drop policy if exists "facility_income_log admin read" on public.facility_income_log;
create policy "facility_income_log admin read"
  on public.facility_income_log for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- (시설별, 사용자별, 날짜별) unique — 같은 facility_id 가 null 이어도 동일 user×date 중복 방지
create unique index if not exists facility_income_log_facility_unique_idx
  on public.facility_income_log (user_id, facility_type, facility_id, paid_for_date)
  where facility_id is not null;

-- emart 처럼 facility_id 가 null 인 케이스
create unique index if not exists facility_income_log_emart_unique_idx
  on public.facility_income_log (user_id, facility_type, paid_for_date)
  where facility_id is null;

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
  -- 새로 적립된 항목만 모음. ON CONFLICT 로 같은 날 두 번째 호출은 0 row 반환.
  create temp table _newly_paid (
    user_id uuid not null,
    amount numeric not null
  ) on commit drop;

  -- 1) 이마트 (facility_id = null, 1 mlbg/일)
  with ins as (
    insert into public.facility_income_log (user_id, facility_type, facility_id, paid_for_date, amount)
    select user_id, 'emart', null, v_today_kst, 1.0
    from public.emart_occupations
    on conflict (user_id, facility_type, paid_for_date)
      where facility_id is null
      do nothing
    returning user_id, amount
  )
  insert into _newly_paid (user_id, amount) select user_id, amount from ins;

  -- 2) 공장
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

  -- 3) 맛집 핀
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

  -- 4) 육아 핀
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

  -- last_claimed_at 갱신 (관습 유지) — 새로 적립된 사용자들의 occupations 만
  update public.emart_occupations o
    set last_claimed_at = v_now
    from _newly_paid n
    where n.user_id = o.user_id
      and exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id
                    and l.facility_type = 'emart'
                    and l.paid_for_date = v_today_kst);
  update public.factory_occupations o
    set last_claimed_at = v_now
    where exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id
                    and l.facility_type = 'factory'
                    and l.facility_id = o.factory_id
                    and l.paid_for_date = v_today_kst);
  update public.restaurant_pin_occupations o
    set last_claimed_at = v_now
    where exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id
                    and l.facility_type = 'restaurant'
                    and l.facility_id = o.pin_id
                    and l.paid_for_date = v_today_kst);
  update public.kids_pin_occupations o
    set last_claimed_at = v_now
    where exists (select 1 from public.facility_income_log l
                  where l.user_id = o.user_id
                    and l.facility_type = 'kids'
                    and l.facility_id = o.pin_id
                    and l.paid_for_date = v_today_kst);

  -- 사용자별 합산 → balance + 알림
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
         '오늘 시설 수익 배당 +' || total::text || ' mlbg',
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
  '시설 수익 — 오늘 (KST) 1일치 멱등 지급. 같은 날 두 번 호출돼도 같은 시설 중복 X.';

notify pgrst, 'reload schema';
