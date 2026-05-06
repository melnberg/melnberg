-- ──────────────────────────────────────────────
-- 128: 한강 북/남 판정을 자치구 기반으로 (lat 기반보다 정확)
-- 단지·시설 좌표 → 가장 가까운 서울 자치구 → 강북/강남 매핑.
-- 광진구·강동구 같이 lat 만으론 헷갈리는 케이스도 정확.
-- ──────────────────────────────────────────────

create table if not exists public.seoul_sgg_river_side (
  sgg_code text primary key,
  name text not null,
  side text not null check (side in ('north', 'south')),
  lat double precision not null,
  lng double precision not null
);

-- 강북 14개
insert into public.seoul_sgg_river_side (sgg_code, name, side, lat, lng) values
  ('11110', '종로구',   'north', 37.5735, 126.9788),
  ('11140', '중구',     'north', 37.5641, 126.9979),
  ('11170', '용산구',   'north', 37.5326, 126.9905),
  ('11200', '성동구',   'north', 37.5635, 127.0367),
  ('11215', '광진구',   'north', 37.5385, 127.0824),
  ('11230', '동대문구', 'north', 37.5744, 127.0399),
  ('11260', '중랑구',   'north', 37.6066, 127.0926),
  ('11290', '성북구',   'north', 37.5894, 127.0167),
  ('11305', '강북구',   'north', 37.6396, 127.0257),
  ('11320', '도봉구',   'north', 37.6688, 127.0470),
  ('11350', '노원구',   'north', 37.6543, 127.0566),
  ('11380', '은평구',   'north', 37.6027, 126.9291),
  ('11410', '서대문구', 'north', 37.5791, 126.9368),
  ('11440', '마포구',   'north', 37.5663, 126.9019),
  -- 강남 11개
  ('11470', '양천구',   'south', 37.5170, 126.8666),
  ('11500', '강서구',   'south', 37.5509, 126.8495),
  ('11530', '구로구',   'south', 37.4954, 126.8874),
  ('11545', '금천구',   'south', 37.4569, 126.8955),
  ('11560', '영등포구', 'south', 37.5264, 126.8964),
  ('11590', '동작구',   'south', 37.5124, 126.9395),
  ('11620', '관악구',   'south', 37.4784, 126.9516),
  ('11650', '서초구',   'south', 37.4836, 127.0327),
  ('11680', '강남구',   'south', 37.5172, 127.0473),
  ('11710', '송파구',   'south', 37.5145, 127.1059),
  ('11740', '강동구',   'south', 37.5301, 127.1238)
on conflict (sgg_code) do update
  set side = excluded.side, lat = excluded.lat, lng = excluded.lng;

-- 좌표 → 한강 북/남 (가장 가까운 자치구 기반)
create or replace function public.han_river_side(p_lat double precision, p_lng double precision)
returns text language sql stable security definer set search_path = public as $$
  select side from public.seoul_sgg_river_side
  order by ((lat - p_lat) * (lat - p_lat) + (lng - p_lng) * (lng - p_lng)) asc
  limit 1;
$$;
grant execute on function public.han_river_side(double precision, double precision) to authenticated, anon;

-- check_bridge_toll 재정의 — 자치구 기반 north/south 비교
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
  v_from_side text;
  v_to_side text;
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

  v_from_side := public.han_river_side(v_from_lat, v_from_lng);
  v_to_side   := public.han_river_side(p_to_lat, p_to_lng);

  -- 같은 쪽이면 횡단 X
  if v_from_side is null or v_to_side is null or v_from_side = v_to_side then
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

  -- 본인 다리는 무료. 무주는 차감 (소각).
  if v_chosen_owner_id = v_uid then
    return query select false, v_chosen_id, v_chosen_name, v_chosen_owner_id, v_chosen_owner_name, 0::numeric; return;
  end if;

  return query select true, v_chosen_id, v_chosen_name, v_chosen_owner_id,
    coalesce(v_chosen_owner_name, '(무주 — 소각)'),
    0.5::numeric;
end;
$$;
grant execute on function public.check_bridge_toll(double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
