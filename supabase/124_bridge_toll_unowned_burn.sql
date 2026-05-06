-- ──────────────────────────────────────────────
-- 124: 무주 다리도 통행료 차감 (소각)
-- 120 의 pay_bridge_toll_and_update 는 무주 다리에서 무료 통과였음.
-- 변경: 무주 다리도 0.5 차감 → 받을 사람 없음 (소각). 주인 생기면 그 시점부터 새 주인에게.
-- check_bridge_toll 도 무주 다리에서 required=true 반환 + owner_name='(무주)' 표기.
-- ──────────────────────────────────────────────

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
  v_from_river double precision;
  v_to_river double precision;
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

  v_from_river := public.han_river_lat(v_from_lng);
  v_to_river   := public.han_river_lat(p_to_lng);

  if not (
    (v_from_lat > v_from_river + 0.005 and p_to_lat < v_to_river - 0.005) or
    (v_from_lat < v_from_river - 0.005 and p_to_lat > v_to_river + 0.005)
  ) then
    return query select false, null::bigint, null::text, null::uuid, null::text, 0::numeric; return;
  end if;

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

  -- 본인 다리만 무료. 무주는 차감 (소각).
  if v_chosen_owner_id = v_uid then
    return query select false, v_chosen_id, v_chosen_name, v_chosen_owner_id, v_chosen_owner_name, 0::numeric; return;
  end if;

  return query select true, v_chosen_id, v_chosen_name, v_chosen_owner_id,
    coalesce(v_chosen_owner_name, '(무주 — 소각)'),
    0.5::numeric;
end;
$$;
grant execute on function public.check_bridge_toll(double precision, double precision) to authenticated;

-- pay_bridge_toll_and_update — 무주 다리도 차감, 받을 사람 없으면 소각
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

  -- 본인 다리만 무료
  if v_owner_id = v_uid then
    update public.profiles
      set last_activity_lat = p_to_lat, last_activity_lng = p_to_lng, last_activity_at = now()
      where id = v_uid;
    return query select true, 0::numeric, '본인 다리 — 무료 통과'::text; return;
  end if;

  -- 잔액 확인 + 차감
  select coalesce(mlbg_balance, 0), last_activity_lat, last_activity_lng
    into v_balance, v_from_lat, v_from_lng
    from public.profiles where id = v_uid for update;

  if v_balance < v_amount then
    return query select false, v_amount, ('잔액 부족 — 통행료 ' || v_amount || ' mlbg 필요')::text; return;
  end if;

  update public.profiles set mlbg_balance = mlbg_balance - v_amount where id = v_uid;
  -- 무주 다리는 소각 (owner_id NULL → 누구에게도 안 감). 주인 있으면 주인에게.
  if v_owner_id is not null then
    update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_amount where id = v_owner_id;
    insert into public.bridge_toll_log (user_id, bridge_id, bridge_owner_id, amount, from_lat, from_lng, to_lat, to_lng)
      values (v_uid, p_bridge_id, v_owner_id, v_amount, v_from_lat, v_from_lng, p_to_lat, p_to_lng);
  end if;
  -- 무주는 로그도 안 남김 (bridge_owner_id NOT NULL 제약)

  update public.profiles
    set last_activity_lat = p_to_lat, last_activity_lng = p_to_lng, last_activity_at = now()
    where id = v_uid;

  return query select true, v_amount, case when v_owner_id is null then '소각 (무주)' else null end::text;
end;
$$;
grant execute on function public.pay_bridge_toll_and_update(double precision, double precision, bigint) to authenticated;

notify pgrst, 'reload schema';
