-- ──────────────────────────────────────────────
-- 087: 공장은 1인 다수 보유 허용 (이마트만 1인 1점포 유지)
-- - factory_occupations.user_id 의 unique 제거
-- - occupy_factory / buy_factory: 1인 1공장 검증 제거
-- - release_factory / claim_factory_income: p_factory_id 파라미터로 특정 공장 지정
-- ──────────────────────────────────────────────

drop index if exists public.factory_one_per_user;

-- occupy: 1인1공장 검증 제거
create or replace function public.occupy_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_paid numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_taken int;
  v_loc record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_loc from public.factory_locations where id = p_factory_id;
  if v_loc.id is null then return query select false, '존재하지 않는 시설'::text, 0::numeric; return; end if;
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

-- buy: 1인1공장 검증 제거
create or replace function public.buy_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_price numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_listing record;
  v_buyer_balance numeric;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
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

-- release: p_factory_id 파라미터 추가
drop function if exists public.release_factory();
create or replace function public.release_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_refund numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_occ record;
  v_loc record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_occ from public.factory_occupations where user_id = v_uid and factory_id = p_factory_id;
  if v_occ.id is null then return query select false, '본인 보유 시설이 아님'::text, 0::numeric; return; end if;
  select * into v_loc from public.factory_locations where id = v_occ.factory_id;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_loc.occupy_price where id = v_uid;
  delete from public.factory_occupations where id = v_occ.id;
  delete from public.factory_listings where factory_id = v_occ.factory_id;
  return query select true, null::text, v_loc.occupy_price;
end;
$$;
grant execute on function public.release_factory(bigint) to authenticated;

-- claim_factory_income: p_factory_id 파라미터 추가 (특정 공장 청구)
drop function if exists public.claim_factory_income();
create or replace function public.claim_factory_income(p_factory_id bigint)
returns table(out_success boolean, out_earned numeric, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_occ record;
  v_loc record;
  v_now timestamptz := now();
  v_days int;
  v_earned numeric;
begin
  if v_uid is null then return query select false, 0::numeric, '로그인이 필요해요'::text; return; end if;
  select * into v_occ from public.factory_occupations where user_id = v_uid and factory_id = p_factory_id for update;
  if v_occ.id is null then return query select false, 0::numeric, '본인 보유 시설이 아님'::text; return; end if;
  select * into v_loc from public.factory_locations where id = v_occ.factory_id;
  v_days := floor(extract(epoch from (v_now - coalesce(v_occ.last_claimed_at, v_occ.occupied_at))) / 86400)::int;
  if v_days < 1 then return query select false, 0::numeric, '아직 24시간 안 지남'::text; return; end if;
  v_earned := v_days * v_loc.daily_income;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_earned where id = v_uid;
  update public.factory_occupations
    set last_claimed_at = coalesce(last_claimed_at, occupied_at) + (v_days || ' days')::interval
    where id = v_occ.id;
  return query select true, v_earned, null::text;
end;
$$;
grant execute on function public.claim_factory_income(bigint) to authenticated;
