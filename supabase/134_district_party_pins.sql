-- ──────────────────────────────────────────────
-- 134: 서울 24개 구청 + 시청 정당핀 50개 추가
-- 각 구청·시청에 더불어민주당(파랑) + 국민의힘(빨강) 2핀 배치.
-- 분양가 200, 일 수익 1.
-- 같은 구청에 한 사람이 두 핀 못 사도록 제약 (region_code 기준).
-- 6/3 지방선거 정산 함수: 당선당 → daily_income 10배 / 낙선당 → 비용몰수 + 핀 삭제.
-- ──────────────────────────────────────────────

-- 1) region_code 컬럼 (LAWD 5자리, 서울 11***)
alter table public.factory_locations
  add column if not exists region_code text;

create index if not exists factory_locations_region_brand_idx
  on public.factory_locations(region_code, brand)
  where brand in ('party_dem', 'party_ppl');

-- 2) 25개소 × 2당 = 50핀 INSERT
-- 좌표는 동·당 마커 겹침 방지로 lng ±0.0006 (≈ 50m) 분리.
insert into public.factory_locations (brand, name, address, lat, lng, occupy_price, daily_income, region_code) values
  -- 종로구청
  ('party_dem',   '종로구청 — 더불어민주당',   '서울 종로구 종로1길 36',          37.5735, 126.9783, 200, 1, '11110'),
  ('party_ppl',   '종로구청 — 국민의힘',       '서울 종로구 종로1길 36',          37.5735, 126.9795, 200, 1, '11110'),
  -- 중구청
  ('party_dem',   '중구청 — 더불어민주당',     '서울 중구 창경궁로 17',            37.5640, 126.9973, 200, 1, '11140'),
  ('party_ppl',   '중구청 — 국민의힘',         '서울 중구 창경궁로 17',            37.5640, 126.9985, 200, 1, '11140'),
  -- 용산구청
  ('party_dem',   '용산구청 — 더불어민주당',   '서울 용산구 녹사평대로 150',       37.5325, 126.9899, 200, 1, '11170'),
  ('party_ppl',   '용산구청 — 국민의힘',       '서울 용산구 녹사평대로 150',       37.5325, 126.9911, 200, 1, '11170'),
  -- 성동구청
  ('party_dem',   '성동구청 — 더불어민주당',   '서울 성동구 고산자로 270',         37.5634, 127.0361, 200, 1, '11200'),
  ('party_ppl',   '성동구청 — 국민의힘',       '서울 성동구 고산자로 270',         37.5634, 127.0373, 200, 1, '11200'),
  -- 광진구청
  ('party_dem',   '광진구청 — 더불어민주당',   '서울 광진구 자양로 117',           37.5385, 127.0820, 200, 1, '11215'),
  ('party_ppl',   '광진구청 — 국민의힘',       '서울 광진구 자양로 117',           37.5385, 127.0832, 200, 1, '11215'),
  -- 동대문구청
  ('party_dem',   '동대문구청 — 더불어민주당', '서울 동대문구 천호대로 145',       37.5744, 127.0389, 200, 1, '11230'),
  ('party_ppl',   '동대문구청 — 국민의힘',     '서울 동대문구 천호대로 145',       37.5744, 127.0401, 200, 1, '11230'),
  -- 중랑구청
  ('party_dem',   '중랑구청 — 더불어민주당',   '서울 중랑구 봉화산로 179',         37.6063, 127.0919, 200, 1, '11260'),
  ('party_ppl',   '중랑구청 — 국민의힘',       '서울 중랑구 봉화산로 179',         37.6063, 127.0931, 200, 1, '11260'),
  -- 성북구청
  ('party_dem',   '성북구청 — 더불어민주당',   '서울 성북구 보문로 168',           37.5894, 127.0161, 200, 1, '11290'),
  ('party_ppl',   '성북구청 — 국민의힘',       '서울 성북구 보문로 168',           37.5894, 127.0173, 200, 1, '11290'),
  -- 강북구청
  ('party_dem',   '강북구청 — 더불어민주당',   '서울 강북구 도봉로89길 13',        37.6396, 127.0251, 200, 1, '11305'),
  ('party_ppl',   '강북구청 — 국민의힘',       '서울 강북구 도봉로89길 13',        37.6396, 127.0263, 200, 1, '11305'),
  -- 도봉구청
  ('party_dem',   '도봉구청 — 더불어민주당',   '서울 도봉구 마들로 656',           37.6688, 127.0465, 200, 1, '11320'),
  ('party_ppl',   '도봉구청 — 국민의힘',       '서울 도봉구 마들로 656',           37.6688, 127.0477, 200, 1, '11320'),
  -- 노원구청
  ('party_dem',   '노원구청 — 더불어민주당',   '서울 노원구 노해로 437',           37.6543, 127.0562, 200, 1, '11350'),
  ('party_ppl',   '노원구청 — 국민의힘',       '서울 노원구 노해로 437',           37.6543, 127.0574, 200, 1, '11350'),
  -- 은평구청
  ('party_dem',   '은평구청 — 더불어민주당',   '서울 은평구 은평로 195',           37.6027, 126.9284, 200, 1, '11380'),
  ('party_ppl',   '은평구청 — 국민의힘',       '서울 은평구 은평로 195',           37.6027, 126.9296, 200, 1, '11380'),
  -- 서대문구청
  ('party_dem',   '서대문구청 — 더불어민주당', '서울 서대문구 연희로 248',         37.5791, 126.9362, 200, 1, '11410'),
  ('party_ppl',   '서대문구청 — 국민의힘',     '서울 서대문구 연희로 248',         37.5791, 126.9374, 200, 1, '11410'),
  -- 마포구청
  ('party_dem',   '마포구청 — 더불어민주당',   '서울 마포구 월드컵로 212',         37.5663, 126.9013, 200, 1, '11440'),
  ('party_ppl',   '마포구청 — 국민의힘',       '서울 마포구 월드컵로 212',         37.5663, 126.9025, 200, 1, '11440'),
  -- 양천구청
  ('party_dem',   '양천구청 — 더불어민주당',   '서울 양천구 목동동로 105',         37.5169, 126.8660, 200, 1, '11470'),
  ('party_ppl',   '양천구청 — 국민의힘',       '서울 양천구 목동동로 105',         37.5169, 126.8672, 200, 1, '11470'),
  -- 강서구청
  ('party_dem',   '강서구청 — 더불어민주당',   '서울 강서구 화곡로 302',           37.5509, 126.8491, 200, 1, '11500'),
  ('party_ppl',   '강서구청 — 국민의힘',       '서울 강서구 화곡로 302',           37.5509, 126.8503, 200, 1, '11500'),
  -- 구로구청
  ('party_dem',   '구로구청 — 더불어민주당',   '서울 구로구 가마산로 245',         37.4954, 126.8868, 200, 1, '11530'),
  ('party_ppl',   '구로구청 — 국민의힘',       '서울 구로구 가마산로 245',         37.4954, 126.8880, 200, 1, '11530'),
  -- 금천구청
  ('party_dem',   '금천구청 — 더불어민주당',   '서울 금천구 시흥대로 73길 70',     37.4567, 126.8951, 200, 1, '11545'),
  ('party_ppl',   '금천구청 — 국민의힘',       '서울 금천구 시흥대로 73길 70',     37.4567, 126.8963, 200, 1, '11545'),
  -- 영등포구청
  ('party_dem',   '영등포구청 — 더불어민주당', '서울 영등포구 당산로 123',         37.5264, 126.8956, 200, 1, '11560'),
  ('party_ppl',   '영등포구청 — 국민의힘',     '서울 영등포구 당산로 123',         37.5264, 126.8968, 200, 1, '11560'),
  -- 동작구청
  ('party_dem',   '동작구청 — 더불어민주당',   '서울 동작구 장승배기로 161',       37.5125, 126.9389, 200, 1, '11590'),
  ('party_ppl',   '동작구청 — 국민의힘',       '서울 동작구 장승배기로 161',       37.5125, 126.9401, 200, 1, '11590'),
  -- 관악구청
  ('party_dem',   '관악구청 — 더불어민주당',   '서울 관악구 관악로 145',           37.4781, 126.9508, 200, 1, '11620'),
  ('party_ppl',   '관악구청 — 국민의힘',       '서울 관악구 관악로 145',           37.4781, 126.9520, 200, 1, '11620'),
  -- 서초구청
  ('party_dem',   '서초구청 — 더불어민주당',   '서울 서초구 남부순환로 2584',      37.4836, 127.0321, 200, 1, '11650'),
  ('party_ppl',   '서초구청 — 국민의힘',       '서울 서초구 남부순환로 2584',      37.4836, 127.0333, 200, 1, '11650'),
  -- 강남구청
  ('party_dem',   '강남구청 — 더불어민주당',   '서울 강남구 학동로 426',           37.5172, 127.0467, 200, 1, '11680'),
  ('party_ppl',   '강남구청 — 국민의힘',       '서울 강남구 학동로 426',           37.5172, 127.0479, 200, 1, '11680'),
  -- 송파구청
  ('party_dem',   '송파구청 — 더불어민주당',   '서울 송파구 올림픽로 326',         37.5145, 127.1060, 200, 1, '11710'),
  ('party_ppl',   '송파구청 — 국민의힘',       '서울 송파구 올림픽로 326',         37.5145, 127.1072, 200, 1, '11710'),
  -- 강동구청
  ('party_dem',   '강동구청 — 더불어민주당',   '서울 강동구 성내로 25',            37.5301, 127.1232, 200, 1, '11740'),
  ('party_ppl',   '강동구청 — 국민의힘',       '서울 강동구 성내로 25',            37.5301, 127.1244, 200, 1, '11740'),
  -- 서울특별시청 (LAWD 11000)
  ('party_dem',   '서울시청 — 더불어민주당',   '서울 중구 세종대로 110',           37.5663, 126.9773, 200, 1, '11000'),
  ('party_ppl',   '서울시청 — 국민의힘',       '서울 중구 세종대로 110',           37.5663, 126.9785, 200, 1, '11000')
on conflict do nothing;

-- 3) occupy_factory 재정의 — 같은 region 한 명 한 핀 제약 추가
create or replace function public.occupy_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_paid numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_taken int;
  v_loc record;
  v_dup int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_loc from public.factory_locations where id = p_factory_id;
  if v_loc.id is null then return query select false, '존재하지 않는 시설'::text, 0::numeric; return; end if;
  select count(*) into v_taken from public.factory_occupations where factory_id = p_factory_id;
  if v_taken > 0 then return query select false, '이미 다른 사람이 점거한 시설'::text, 0::numeric; return; end if;

  -- 정당핀 (party_dem / party_ppl) 은 같은 구(region_code) 에 본인 핀 1개만 허용
  if v_loc.brand in ('party_dem', 'party_ppl') and v_loc.region_code is not null then
    select count(*) into v_dup
      from public.factory_occupations fo
      join public.factory_locations f on f.id = fo.factory_id
      where fo.user_id = v_uid
        and f.brand in ('party_dem', 'party_ppl')
        and f.region_code = v_loc.region_code;
    if v_dup > 0 then
      return query select false, '같은 구청에는 한 명이 한 개만 분양받을 수 있어요'::text, 0::numeric; return;
    end if;
  end if;

  select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid for update;
  if v_balance < v_loc.occupy_price then
    return query select false, ('mlbg 부족 — 현재 ' || v_balance || ', 분양가 ' || v_loc.occupy_price)::text, 0::numeric; return;
  end if;
  update public.profiles set mlbg_balance = mlbg_balance - v_loc.occupy_price where id = v_uid;
  insert into public.factory_occupations (factory_id, user_id, last_claimed_at) values (p_factory_id, v_uid, now());
  return query select true, null::text, v_loc.occupy_price;
end;
$$;
grant execute on function public.occupy_factory(bigint) to authenticated;

-- 4) buy_factory 재정의 — 매물 매수 시에도 같은 region 검증
create or replace function public.buy_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_price numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_listing record;
  v_buyer_balance numeric;
  v_loc record;
  v_dup int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_listing from public.factory_listings where factory_id = p_factory_id for update;
  if v_listing.id is null then return query select false, '매도 등록되지 않은 시설'::text, 0::numeric; return; end if;
  if v_listing.seller_id = v_uid then return query select false, '본인 매물은 못 사요'::text, 0::numeric; return; end if;

  select * into v_loc from public.factory_locations where id = p_factory_id;
  if v_loc.brand in ('party_dem', 'party_ppl') and v_loc.region_code is not null then
    select count(*) into v_dup
      from public.factory_occupations fo
      join public.factory_locations f on f.id = fo.factory_id
      where fo.user_id = v_uid
        and f.brand in ('party_dem', 'party_ppl')
        and f.region_code = v_loc.region_code
        and f.id <> p_factory_id;
    if v_dup > 0 then
      return query select false, '같은 구청에는 한 명이 한 개만 살 수 있어요'::text, 0::numeric; return;
    end if;
  end if;

  select coalesce(mlbg_balance, 0) into v_buyer_balance from public.profiles where id = v_uid for update;
  if v_buyer_balance < v_listing.price then
    return query select false, ('mlbg 부족 — 현재 ' || v_buyer_balance || ', 가격 ' || v_listing.price)::text, 0::numeric; return;
  end if;
  update public.profiles set mlbg_balance = mlbg_balance - v_listing.price where id = v_uid;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_listing.price where id = v_listing.seller_id;
  update public.factory_occupations set user_id = v_uid, occupied_at = now(), last_claimed_at = now() where factory_id = p_factory_id;
  delete from public.factory_listings where factory_id = p_factory_id;
  return query select true, null::text, v_listing.price;
end;
$$;
grant execute on function public.buy_factory(bigint) to authenticated;

-- 5) 6/3 지방선거 정산 함수 — 당선당 daily_income ×10, 낙선당 비용 몰수 + 삭제
-- 사용:
--   select public.settle_local_election_2026('{
--     "11680": "party_dem",
--     "11650": "party_ppl",
--     ...
--   }'::jsonb);
create or replace function public.settle_local_election_2026(p_winners jsonb)
returns table(region_code text, winner_brand text, loser_brand text, message text)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_winner text;
  v_loser text;
begin
  for r in
    select distinct f.region_code from public.factory_locations f
    where f.brand in ('party_dem', 'party_ppl') and f.region_code is not null
  loop
    v_winner := p_winners ->> r.region_code;
    if v_winner is null or v_winner not in ('party_dem', 'party_ppl') then
      region_code := r.region_code; winner_brand := null; loser_brand := null;
      message := '당선당 미지정 — skip'; return next; continue;
    end if;
    v_loser := case when v_winner = 'party_dem' then 'party_ppl' else 'party_dem' end;

    -- 당선: daily_income 10 으로 상향
    update public.factory_locations
      set daily_income = 10
      where region_code = r.region_code and brand = v_winner;

    -- 낙선: 점거자 환불 없이 occupations 삭제 + 매물 삭제 + location 삭제
    delete from public.factory_occupations fo
      using public.factory_locations f
      where fo.factory_id = f.id and f.region_code = r.region_code and f.brand = v_loser;
    delete from public.factory_listings fl
      using public.factory_locations f
      where fl.factory_id = f.id and f.region_code = r.region_code and f.brand = v_loser;
    delete from public.factory_locations
      where region_code = r.region_code and brand = v_loser;

    region_code := r.region_code; winner_brand := v_winner; loser_brand := v_loser;
    message := '정산 완료'; return next;
  end loop;
end;
$$;
grant execute on function public.settle_local_election_2026(jsonb) to service_role;

-- 6) list_struck_targets 는 110 의 brand_label CASE 그대로 유효 (party_dem / party_ppl 매핑됨).

notify pgrst, 'reload schema';
