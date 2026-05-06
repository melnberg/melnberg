-- ──────────────────────────────────────────────
-- 120: 다리 통행료 시스템
-- 사용자가 단지간 이동 (마지막 활동 좌표 → 새 활동 좌표) 시 한강을 횡단하면
-- 가장 가까운 다리 소유주에게 0.5 mlbg 지불 (본인 다리/무주 다리는 무료).
-- 활동 = 찐리뷰 좋아요 / 단지 글 작성.
-- ──────────────────────────────────────────────

-- 마지막 활동 좌표 추적
alter table public.profiles
  add column if not exists last_activity_lat double precision,
  add column if not exists last_activity_lng double precision,
  add column if not exists last_activity_at timestamptz;

-- 통행료 로그
create table if not exists public.bridge_toll_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bridge_id bigint not null references public.factory_locations(id) on delete cascade,
  bridge_owner_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  from_lat double precision,
  from_lng double precision,
  to_lat double precision,
  to_lng double precision,
  created_at timestamptz not null default now()
);
create index if not exists bridge_toll_log_user_idx on public.bridge_toll_log(user_id, created_at desc);
create index if not exists bridge_toll_log_owner_idx on public.bridge_toll_log(bridge_owner_id, created_at desc);

alter table public.bridge_toll_log enable row level security;
drop policy if exists "bridge_toll_log readable by participant" on public.bridge_toll_log;
create policy "bridge_toll_log readable by participant"
  on public.bridge_toll_log for select
  using (auth.uid() = user_id or auth.uid() = bridge_owner_id);

-- 한강 횡단 감지 + 가장 가까운 다리 선택 (longitude 중간점 기준)
-- 한강 위도 ~ 37.518. 북쪽 > 37.52, 남쪽 < 37.515 로 단순 구분.
-- 둘 사이 (37.515 ~ 37.52) 는 이동 중으로 간주, 톨 없음 (여의도 등 강 위 지역 안전).
create or replace function public.check_bridge_toll(
  p_to_lat double precision,
  p_to_lng double precision
)
returns table(
  out_required boolean,
  out_bridge_id bigint,
  out_bridge_name text,
  out_owner_id uuid,
  out_owner_name text,
  out_amount numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_from_lat double precision;
  v_from_lng double precision;
  v_mid_lng double precision;
  v_chosen_id bigint;
  v_chosen_name text;
  v_chosen_owner_id uuid;
  v_chosen_owner_name text;
  v_min_dist double precision := 999;
  v_bridge record;
begin
  if v_uid is null then
    return query select false, null::bigint, null::text, null::uuid, null::text, 0::numeric; return;
  end if;

  select last_activity_lat, last_activity_lng into v_from_lat, v_from_lng
    from public.profiles where id = v_uid;

  if v_from_lat is null or v_from_lng is null then
    return query select false, null::bigint, null::text, null::uuid, null::text, 0::numeric; return;
  end if;

  -- 한강 횡단 감지
  if not (
    (v_from_lat > 37.52 and p_to_lat < 37.515) or
    (v_from_lat < 37.515 and p_to_lat > 37.52)
  ) then
    return query select false, null::bigint, null::text, null::uuid, null::text, 0::numeric; return;
  end if;

  -- 가장 가까운 다리 (longitude 중간점 기준)
  v_mid_lng := (v_from_lng + p_to_lng) / 2;
  for v_bridge in
    select f.id, f.name, f.lng, fo.user_id as owner_id, pr.display_name as owner_name
    from public.factory_locations f
    left join public.factory_occupations fo on fo.factory_id = f.id
    left join public.profiles pr on pr.id = fo.user_id
    where f.brand = 'bridge'
  loop
    if abs(v_bridge.lng - v_mid_lng) < v_min_dist then
      v_min_dist := abs(v_bridge.lng - v_mid_lng);
      v_chosen_id := v_bridge.id;
      v_chosen_name := v_bridge.name;
      v_chosen_owner_id := v_bridge.owner_id;
      v_chosen_owner_name := v_bridge.owner_name;
    end if;
  end loop;

  if v_chosen_id is null then
    return query select false, null::bigint, null::text, null::uuid, null::text, 0::numeric; return;
  end if;

  -- 점거자 없거나 본인이면 무료
  if v_chosen_owner_id is null or v_chosen_owner_id = v_uid then
    return query select false, v_chosen_id, v_chosen_name, v_chosen_owner_id, v_chosen_owner_name, 0::numeric; return;
  end if;

  return query select true, v_chosen_id, v_chosen_name, v_chosen_owner_id, coalesce(v_chosen_owner_name, '익명'), 0.5::numeric;
end;
$$;
grant execute on function public.check_bridge_toll(double precision, double precision) to authenticated;

-- 톨 결제 + 활동 위치 갱신 (atomic). 톨 필요 없으면 위치만 갱신.
create or replace function public.pay_bridge_toll_and_update(
  p_to_lat double precision,
  p_to_lng double precision,
  p_bridge_id bigint default null
)
returns table(out_success boolean, out_paid numeric, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_balance numeric;
  v_amount numeric := 0.5;
  v_from_lat double precision;
  v_from_lng double precision;
begin
  if v_uid is null then return query select false, 0::numeric, '로그인 필요'::text; return; end if;

  -- 위치 갱신만 (bridge_id 없으면 톨 없는 활동)
  if p_bridge_id is null then
    update public.profiles
      set last_activity_lat = p_to_lat, last_activity_lng = p_to_lng, last_activity_at = now()
      where id = v_uid;
    return query select true, 0::numeric, null::text; return;
  end if;

  -- 다리 점거자 확인
  select fo.user_id into v_owner_id
    from public.factory_locations f
    left join public.factory_occupations fo on fo.factory_id = f.id
    where f.id = p_bridge_id and f.brand = 'bridge';

  -- 무주 또는 본인 다리 → 무료 통과
  if v_owner_id is null or v_owner_id = v_uid then
    update public.profiles
      set last_activity_lat = p_to_lat, last_activity_lng = p_to_lng, last_activity_at = now()
      where id = v_uid;
    return query select true, 0::numeric, '무료 통과'::text; return;
  end if;

  -- 잔액 확인 + 차감
  select coalesce(mlbg_balance, 0), last_activity_lat, last_activity_lng
    into v_balance, v_from_lat, v_from_lng
    from public.profiles where id = v_uid for update;

  if v_balance < v_amount then
    return query select false, v_amount, ('잔액 부족 — 통행료 ' || v_amount || ' mlbg 필요')::text; return;
  end if;

  update public.profiles set mlbg_balance = mlbg_balance - v_amount where id = v_uid;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_amount where id = v_owner_id;

  insert into public.bridge_toll_log (user_id, bridge_id, bridge_owner_id, amount, from_lat, from_lng, to_lat, to_lng)
    values (v_uid, p_bridge_id, v_owner_id, v_amount, v_from_lat, v_from_lng, p_to_lat, p_to_lng);

  update public.profiles
    set last_activity_lat = p_to_lat, last_activity_lng = p_to_lng, last_activity_at = now()
    where id = v_uid;

  return query select true, v_amount, null::text;
end;
$$;
grant execute on function public.pay_bridge_toll_and_update(double precision, double precision, bigint) to authenticated;

notify pgrst, 'reload schema';
