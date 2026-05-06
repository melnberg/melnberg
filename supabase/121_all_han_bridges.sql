-- ──────────────────────────────────────────────
-- 121: 서울 한강 모든 자동차 다리 일괄 등록 + 횡단 감지 함수 개선
-- 한강대교 (119에서 등록됨) 외 17개 추가.
-- ──────────────────────────────────────────────

insert into public.factory_locations (brand, name, address, lat, lng, occupy_price, daily_income) values
  ('bridge', '가양대교',   '서울 강서구·마포구',   37.5725, 126.8470, 100, 5),
  ('bridge', '성산대교',   '서울 영등포구·마포구', 37.5564, 126.8912, 100, 5),
  ('bridge', '양화대교',   '서울 영등포구·마포구', 37.5475, 126.9007, 100, 5),
  ('bridge', '서강대교',   '서울 영등포구·마포구', 37.5395, 126.9265, 100, 5),
  ('bridge', '마포대교',   '서울 영등포구·마포구', 37.5408, 126.9450, 100, 5),
  ('bridge', '원효대교',   '서울 영등포구·용산구', 37.5298, 126.9540, 100, 5),
  ('bridge', '동작대교',   '서울 동작구·용산구',   37.5152, 126.9853, 100, 5),
  ('bridge', '반포대교',   '서울 서초구·용산구',   37.5141, 126.9954, 100, 5),
  ('bridge', '한남대교',   '서울 강남구·용산구',   37.5238, 127.0048, 100, 5),
  ('bridge', '동호대교',   '서울 강남구·성동구',   37.5396, 127.0345, 100, 5),
  ('bridge', '성수대교',   '서울 강남구·성동구',   37.5380, 127.0457, 100, 5),
  ('bridge', '영동대교',   '서울 강남구·광진구',   37.5407, 127.0625, 100, 5),
  ('bridge', '청담대교',   '서울 강남구·광진구',   37.5267, 127.0750, 100, 5),
  ('bridge', '잠실대교',   '서울 송파구·광진구',   37.5152, 127.0935, 100, 5),
  ('bridge', '올림픽대교', '서울 송파구·광진구',   37.5212, 127.1140, 100, 5),
  ('bridge', '천호대교',   '서울 강동구·광진구',   37.5414, 127.1241, 100, 5),
  ('bridge', '광진교',     '서울 강동구·광진구',   37.5413, 127.1133, 100, 5)
on conflict do nothing;

-- 한강 중심 위도 — longitude 따라 휘어짐. 횡단 감지에 사용.
create or replace function public.han_river_lat(p_lng double precision)
returns double precision language sql immutable as $$
  select case
    when p_lng < 126.910 then 37.560   -- 가양/성산 (강 북쪽으로 휨)
    when p_lng < 127.020 then 37.520   -- 마포~한남 (전형 위치)
    else 37.535                        -- 청담~광진 (다시 북쪽)
  end;
$$;

-- check_bridge_toll 개선 — 한강 임계값을 lng 별로 동적 결정
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

  -- 한강 중심 임계값 (출발/도착 longitude 별)
  v_from_river := public.han_river_lat(v_from_lng);
  v_to_river   := public.han_river_lat(p_to_lng);

  -- 한쪽은 강 북, 한쪽은 강 남 이어야 횡단
  if not (
    (v_from_lat > v_from_river + 0.005 and p_to_lat < v_to_river - 0.005) or
    (v_from_lat < v_from_river - 0.005 and p_to_lat > v_to_river + 0.005)
  ) then
    return query select false, null::bigint, null::text, null::uuid, null::text, 0::numeric; return;
  end if;

  -- 가장 가까운 다리 (longitude 중간점 기준 — 자동차 네비 직선 근사)
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

  if v_chosen_owner_id is null or v_chosen_owner_id = v_uid then
    return query select false, v_chosen_id, v_chosen_name, v_chosen_owner_id, v_chosen_owner_name, 0::numeric; return;
  end if;

  return query select true, v_chosen_id, v_chosen_name, v_chosen_owner_id, coalesce(v_chosen_owner_name, '익명'), 0.5::numeric;
end;
$$;
grant execute on function public.check_bridge_toll(double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
