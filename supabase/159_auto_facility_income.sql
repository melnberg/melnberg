-- ──────────────────────────────────────────────
-- 159: 상업시설 (이마트·공장·맛집·육아) 일별 수익 자동 지급
--
-- 이전: 사용자가 패널에서 [수익청구] 버튼 직접 눌러야 mlbg 적립.
--   - claim_emart_income, claim_factory_income(id), claim_restaurant_pin_income(id), claim_kids_pin_income(id)
--   - 사용자 인지·클릭 부담 + 청구 안 해서 누적 손실
--
-- 변경: cron 이 매일 1회 auto_distribute_facility_income() 호출.
--   - 4개 occupations 테이블 모두 처리 — 일수 계산 + last_claimed_at 갱신 + balance 적립
--   - 각 수령자에게 알림 1건 (type=facility_income_auto, total amount).
--   - 기존 claim_* RPC 는 보존 (수동 청구도 필요 시 가능).
-- ──────────────────────────────────────────────

-- 알림 타입 확장
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'community_comment','apt_comment','apt_evicted','feedback_reply',
    'admin_notice','bio_comment',
    'offer_made','offer_accepted','snatch_made',
    'election_winner','election_loser',
    'facility_income_auto'
  ));

-- 자동 지급 RPC — service_role 만 호출 (cron). 일별 1회 권장.
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
  -- 임시 누적 테이블 — 트랜잭션 끝나면 자동 소멸
  create temp table _facility_payouts (
    user_id uuid not null,
    earned numeric not null
  ) on commit drop;

  -- 1) 이마트 (1인 1점포, 1 mlbg/일)
  with eligible as (
    select id, user_id,
      floor(extract(epoch from (v_now - coalesce(last_claimed_at, occupied_at))) / 86400)::int as days
    from public.emart_occupations
  )
  insert into _facility_payouts (user_id, earned)
  select user_id, days * 1.0 from eligible where days >= 1;

  update public.emart_occupations eo
  set last_claimed_at = coalesce(eo.last_claimed_at, eo.occupied_at)
    + (floor(extract(epoch from (v_now - coalesce(eo.last_claimed_at, eo.occupied_at))) / 86400)::int || ' days')::interval
  where floor(extract(epoch from (v_now - coalesce(eo.last_claimed_at, eo.occupied_at))) / 86400)::int >= 1;

  -- 2) 공장 (다중 보유 가능, daily_income 별)
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

  -- 3) 맛집 핀 (다중 보유, pin.daily_income)
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

  -- 4) 육아 핀 (다중 보유, pin.daily_income)
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

grant execute on function public.auto_distribute_facility_income() to service_role;
comment on function public.auto_distribute_facility_income is
  '4개 상업시설 (이마트·공장·맛집·육아) 일별 수익을 자동 적립 + 사용자 알림 1건. cron 일별 1회 호출 권장.';

notify pgrst, 'reload schema';
