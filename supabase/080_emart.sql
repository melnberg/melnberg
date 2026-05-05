-- ──────────────────────────────────────────────
-- 080: 이마트 분양 — 새 분양 대상 (5 mlbg, 1인 1점포)
-- 카카오 지도 places API 의 place_id 를 자연키로 사용.
-- ──────────────────────────────────────────────

create table if not exists public.emart_locations (
  id bigserial primary key,
  kakao_place_id text not null unique,
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);
create index if not exists emart_locations_geo_idx on public.emart_locations(lat, lng);

create table if not exists public.emart_occupations (
  id bigserial primary key,
  emart_id bigint not null unique references public.emart_locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  occupied_at timestamptz not null default now()
);
-- 1인 1점포 — partial unique on user_id (active occupation)
create unique index if not exists emart_one_per_user on public.emart_occupations(user_id);

alter table public.emart_locations enable row level security;
alter table public.emart_occupations enable row level security;

drop policy if exists "emart_locations readable by all" on public.emart_locations;
create policy "emart_locations readable by all" on public.emart_locations for select using (true);

drop policy if exists "emart_occupations readable by all" on public.emart_occupations;
create policy "emart_occupations readable by all" on public.emart_occupations for select using (true);

-- 위치 upsert (클라이언트가 카카오 places API 로 발견한 매장을 등록)
create or replace function public.upsert_emart_location(
  p_kakao_place_id text,
  p_name text,
  p_address text,
  p_lat double precision,
  p_lng double precision
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.emart_locations (kakao_place_id, name, address, lat, lng)
    values (p_kakao_place_id, p_name, p_address, p_lat, p_lng)
    on conflict (kakao_place_id) do update set name = excluded.name, address = excluded.address
    returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.upsert_emart_location(text, text, text, double precision, double precision) to authenticated;

-- 이마트 점거 — 5 mlbg 차감 + 1인 1점포 강제
create or replace function public.occupy_emart(p_emart_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_already_have int;
  v_already_taken int;
  v_emart record;
  v_cost numeric := 5;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text; return;
  end if;

  select * into v_emart from public.emart_locations where id = p_emart_id;
  if v_emart.id is null then
    return query select false, '존재하지 않는 매장'::text; return;
  end if;

  -- 본인이 이미 보유? (1인 1점포)
  select count(*) into v_already_have from public.emart_occupations where user_id = v_uid;
  if v_already_have > 0 then
    return query select false, '이미 다른 이마트를 보유 중이에요 (1인 1점포)'::text; return;
  end if;

  -- 매장이 이미 다른 사람 점거?
  select count(*) into v_already_taken from public.emart_occupations where emart_id = p_emart_id;
  if v_already_taken > 0 then
    return query select false, '이미 다른 사람이 점거한 매장이에요'::text; return;
  end if;

  -- 잔액 확인
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

-- 이마트 매각 — 점거 해제 + 5 mlbg 환불 (방어용. 추후 양도/매물 시스템 붙으면 변경)
create or replace function public.release_emart()
returns table(out_success boolean, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing record;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text; return;
  end if;
  select * into v_existing from public.emart_occupations where user_id = v_uid limit 1;
  if v_existing.id is null then
    return query select false, '보유 중인 이마트가 없어요'::text; return;
  end if;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + 5 where id = v_uid;
  delete from public.emart_occupations where id = v_existing.id;
  return query select true, null::text;
end;
$$;
grant execute on function public.release_emart() to authenticated;

-- 위치 + 점거 정보 합쳐서 반환 (지도 핀 + 클릭 시 패널용)
create or replace function public.list_emart_with_occupation()
returns table(
  id bigint,
  kakao_place_id text,
  name text,
  address text,
  lat double precision,
  lng double precision,
  occupier_id uuid,
  occupier_name text,
  occupied_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.kakao_place_id, e.name, e.address, e.lat, e.lng,
    o.user_id as occupier_id,
    p.display_name as occupier_name,
    o.occupied_at
  from public.emart_locations e
  left join public.emart_occupations o on o.emart_id = e.id
  left join public.profiles p on p.id = o.user_id;
$$;
grant execute on function public.list_emart_with_occupation() to anon, authenticated;

comment on table public.emart_locations is '카카오 places API 로 발견된 이마트 매장 위치';
comment on table public.emart_occupations is '이마트 점거 — 1인 1점포';
