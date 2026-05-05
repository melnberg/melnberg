-- ──────────────────────────────────────────────
-- 101: 비-아파트 부동산 인당 4개 제한
-- emart + factory (hynix/samsung/costco/union/cargo/terminal/station)
-- 합산해서 인당 최대 4개. 더 받으려면 기존 매각 필요.
-- - emart 의 1점포 unique 제거 (이제 합산 제한이라 다수 보유 가능)
-- - occupy_emart / buy_emart / occupy_factory / buy_factory 모두 합산 검증 추가
-- ──────────────────────────────────────────────

-- 0) emart 1점포 제약 제거
drop index if exists public.emart_one_per_user;

-- 헬퍼: 비-아파트 합산 카운트
create or replace function public.count_non_apt_holdings(p_uid uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select count(*) from public.emart_occupations where user_id = p_uid), 0)::int
       + coalesce((select count(*) from public.factory_occupations where user_id = p_uid), 0)::int;
$$;
grant execute on function public.count_non_apt_holdings(uuid) to authenticated;

-- 1) occupy_emart — 합산 4개 제한
create or replace function public.occupy_emart(p_emart_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_already_taken int;
  v_holdings int;
  v_emart record;
  v_cost numeric := 5;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select * into v_emart from public.emart_locations where id = p_emart_id;
  if v_emart.id is null then return query select false, '존재하지 않는 매장'::text; return; end if;

  -- 합산 4개 제한
  v_holdings := public.count_non_apt_holdings(v_uid);
  if v_holdings >= 4 then
    return query select false, ('비-아파트 부동산 4개 보유 한도. 기존 매각 후 가능 (현재 ' || v_holdings || '개)')::text; return;
  end if;

  select count(*) into v_already_taken from public.emart_occupations where emart_id = p_emart_id;
  if v_already_taken > 0 then
    return query select false, '이미 다른 사람이 점거한 매장이에요'::text; return;
  end if;

  select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid for update;
  if v_balance < v_cost then
    return query select false, ('mlbg 부족 — 현재 ' || v_balance || ', 분양가 ' || v_cost)::text; return;
  end if;
  update public.profiles set mlbg_balance = mlbg_balance - v_cost where id = v_uid;
  insert into public.emart_occupations (emart_id, user_id) values (p_emart_id, v_uid);
  return query select true, null::text;
end;
$$;
grant execute on function public.occupy_emart(bigint) to authenticated;

-- 2) buy_emart — 합산 4개 제한
create or replace function public.buy_emart(p_emart_id bigint)
returns table(out_success boolean, out_message text, out_price numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_listing record;
  v_buyer_balance numeric;
  v_holdings int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;

  v_holdings := public.count_non_apt_holdings(v_uid);
  if v_holdings >= 4 then
    return query select false, ('비-아파트 부동산 4개 보유 한도. 기존 매각 후 가능 (현재 ' || v_holdings || '개)')::text, 0::numeric; return;
  end if;

  select * into v_listing from public.emart_listings where emart_id = p_emart_id for update;
  if v_listing.id is null then return query select false, '매도 등록되지 않은 매장이에요'::text, 0::numeric; return; end if;
  if v_listing.seller_id = v_uid then return query select false, '본인 매물은 못 사요'::text, 0::numeric; return; end if;

  select coalesce(mlbg_balance, 0) into v_buyer_balance from public.profiles where id = v_uid for update;
  if v_buyer_balance < v_listing.price then
    return query select false, ('mlbg 부족 — 현재 ' || v_buyer_balance || ', 가격 ' || v_listing.price)::text, 0::numeric; return;
  end if;

  update public.profiles set mlbg_balance = mlbg_balance - v_listing.price where id = v_uid;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_listing.price where id = v_listing.seller_id;
  update public.emart_occupations set user_id = v_uid, occupied_at = now(), last_claimed_at = now()
    where emart_id = p_emart_id;
  delete from public.emart_listings where emart_id = p_emart_id;
  return query select true, null::text, v_listing.price;
end;
$$;
grant execute on function public.buy_emart(bigint) to authenticated;

-- 3) occupy_factory — 합산 4개 제한
create or replace function public.occupy_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_paid numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_taken int;
  v_holdings int;
  v_loc record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_loc from public.factory_locations where id = p_factory_id;
  if v_loc.id is null then return query select false, '존재하지 않는 시설'::text, 0::numeric; return; end if;

  v_holdings := public.count_non_apt_holdings(v_uid);
  if v_holdings >= 4 then
    return query select false, ('비-아파트 부동산 4개 보유 한도. 기존 매각 후 가능 (현재 ' || v_holdings || '개)')::text, 0::numeric; return;
  end if;

  select count(*) into v_taken from public.factory_occupations where factory_id = p_factory_id;
  if v_taken > 0 then return query select false, '이미 다른 사람이 점거한 시설'::text, 0::numeric; return; end if;
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

-- 4) buy_factory — 합산 4개 제한
create or replace function public.buy_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_price numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_listing record;
  v_buyer_balance numeric;
  v_holdings int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;

  v_holdings := public.count_non_apt_holdings(v_uid);
  if v_holdings >= 4 then
    return query select false, ('비-아파트 부동산 4개 보유 한도. 기존 매각 후 가능 (현재 ' || v_holdings || '개)')::text, 0::numeric; return;
  end if;

  select * into v_listing from public.factory_listings where factory_id = p_factory_id for update;
  if v_listing.id is null then return query select false, '매도 등록되지 않은 시설'::text, 0::numeric; return; end if;
  if v_listing.seller_id = v_uid then return query select false, '본인 매물은 못 사요'::text, 0::numeric; return; end if;
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

notify pgrst, 'reload schema';

-- 검증 — 현재 인당 보유 분포
select p.display_name,
       (select count(*) from public.emart_occupations where user_id = p.id) as emart,
       (select count(*) from public.factory_occupations where user_id = p.id) as factory,
       public.count_non_apt_holdings(p.id) as total
from public.profiles p
where public.count_non_apt_holdings(p.id) > 0
order by total desc;
