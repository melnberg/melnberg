-- ──────────────────────────────────────────────
-- 083: 반도체공장 분양 — 이천/청주 하이닉스 (1000 mlbg), 평택 삼성전자 (800 mlbg)
-- 매일 수익 20 mlbg. 1인 1공장 (이마트와 별도 계정).
-- emart_* 와 동일 구조의 별도 테이블/RPC.
-- ──────────────────────────────────────────────

create table if not exists public.factory_locations (
  id bigserial primary key,
  brand text not null check (brand in ('hynix', 'samsung', 'costco', 'union')),
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  occupy_price numeric not null,
  daily_income numeric not null default 20,
  created_at timestamptz not null default now()
);

create table if not exists public.factory_occupations (
  id bigserial primary key,
  factory_id bigint not null unique references public.factory_locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  occupied_at timestamptz not null default now(),
  last_claimed_at timestamptz
);
create unique index if not exists factory_one_per_user on public.factory_occupations(user_id);

create table if not exists public.factory_listings (
  id bigserial primary key,
  factory_id bigint not null unique references public.factory_locations(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  price numeric not null check (price > 0),
  description text,
  listed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.factory_comments (
  id bigserial primary key,
  factory_id bigint not null references public.factory_locations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists factory_comments_factory_idx on public.factory_comments(factory_id, created_at desc) where deleted_at is null;

alter table public.factory_locations enable row level security;
alter table public.factory_occupations enable row level security;
alter table public.factory_listings enable row level security;
alter table public.factory_comments enable row level security;

drop policy if exists "factory_locations readable by all" on public.factory_locations;
create policy "factory_locations readable by all" on public.factory_locations for select using (true);
drop policy if exists "factory_occupations readable by all" on public.factory_occupations;
create policy "factory_occupations readable by all" on public.factory_occupations for select using (true);
drop policy if exists "factory_listings readable by all" on public.factory_listings;
create policy "factory_listings readable by all" on public.factory_listings for select using (true);
drop policy if exists "factory_comments readable by all" on public.factory_comments;
create policy "factory_comments readable by all" on public.factory_comments for select using (deleted_at is null);
drop policy if exists "factory_comments insert by self" on public.factory_comments;
create policy "factory_comments insert by self" on public.factory_comments for insert with check (auth.uid() = author_id);
drop policy if exists "factory_comments delete by author" on public.factory_comments;
create policy "factory_comments delete by author" on public.factory_comments for delete using (auth.uid() = author_id);

-- 시드 데이터 (좌표는 대략 — 실제 공장 위치)
insert into public.factory_locations (brand, name, address, lat, lng, occupy_price, daily_income) values
  ('hynix',   'SK하이닉스 이천캠퍼스', '경기 이천시 부발읍 경충대로 2091', 37.2336, 127.4540, 1000, 20),
  ('hynix',   'SK하이닉스 청주캠퍼스', '충북 청주시 흥덕구 청주역로 240', 36.6486, 127.4137, 1000, 20),
  ('samsung', '삼성전자 평택캠퍼스', '경기 평택시 고덕면 삼성로 114',     36.9923, 127.1562,  800, 20),
  ('costco',  '코스트코 양재점', '서울 서초구 양재대로 159',                37.4621, 127.0392,   50,  5),
  ('costco',  '코스트코 상봉점', '서울 중랑구 망우로 353',                  37.5969, 127.0852,   50,  5),
  ('costco',  '코스트코 의정부점', '경기 의정부시 평화로 525',              37.7268, 127.0431,   50,  5),
  ('costco',  '코스트코 일산점', '경기 고양시 일산서구 호수로 817',         37.6735, 126.7691,   50,  5),
  ('costco',  '코스트코 광명점', '경기 광명시 일직로 17',                   37.4234, 126.8856,   50,  5),
  ('costco',  '코스트코 하남점', '경기 하남시 미사대로 750',                37.5667, 127.1948,   50,  5),
  ('union',   '전국금속노조 본부', '서울 영등포구 국회대로 70길 18',         37.5288, 126.9163,   10,  1),
  ('union',   '금속노조 경기지부', '경기 안양시 만안구 안양로 207',           37.4039, 126.9223,   10,  1),
  ('union',   '금속노조 인천지부', '인천 부평구 부평대로 283',                37.4912, 126.7251,   10,  1)
on conflict do nothing;

-- 분양 (occupy)
create or replace function public.occupy_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_paid numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_already int;
  v_taken int;
  v_loc record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_loc from public.factory_locations where id = p_factory_id;
  if v_loc.id is null then return query select false, '존재하지 않는 공장'::text, 0::numeric; return; end if;
  select count(*) into v_already from public.factory_occupations where user_id = v_uid;
  if v_already > 0 then return query select false, '이미 다른 공장 보유 중 (1인 1공장)'::text, 0::numeric; return; end if;
  select count(*) into v_taken from public.factory_occupations where factory_id = p_factory_id;
  if v_taken > 0 then return query select false, '이미 다른 사람이 점거한 공장'::text, 0::numeric; return; end if;
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

-- 보유 해제 (분양가 환불)
create or replace function public.release_factory()
returns table(out_success boolean, out_message text, out_refund numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_occ record;
  v_loc record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_occ from public.factory_occupations where user_id = v_uid limit 1;
  if v_occ.id is null then return query select false, '보유 공장 없음'::text, 0::numeric; return; end if;
  select * into v_loc from public.factory_locations where id = v_occ.factory_id;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_loc.occupy_price where id = v_uid;
  delete from public.factory_occupations where id = v_occ.id;
  delete from public.factory_listings where factory_id = v_occ.factory_id;
  return query select true, null::text, v_loc.occupy_price;
end;
$$;
grant execute on function public.release_factory() to authenticated;

-- 일일 수익 청구 (24시간마다 daily_income mlbg)
create or replace function public.claim_factory_income()
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
  select * into v_occ from public.factory_occupations where user_id = v_uid for update;
  if v_occ.id is null then return query select false, 0::numeric, '보유 공장 없음'::text; return; end if;
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
grant execute on function public.claim_factory_income() to authenticated;

-- 매도 등록 / 해제 / 즉시 매수
create or replace function public.list_factory_for_sale(p_factory_id bigint, p_price numeric, p_description text default null)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_desc text;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  if p_price is null or p_price <= 0 then return query select false, '가격이 잘못됐어요'::text; return; end if;
  select user_id into v_owner from public.factory_occupations where factory_id = p_factory_id;
  if v_owner is null or v_owner <> v_uid then return query select false, '본인 보유 공장만 매도 가능'::text; return; end if;
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_desc is not null and length(v_desc) > 1000 then v_desc := left(v_desc, 1000); end if;
  insert into public.factory_listings (factory_id, seller_id, price, description)
    values (p_factory_id, v_uid, p_price, v_desc)
    on conflict (factory_id) do update
      set seller_id = excluded.seller_id, price = excluded.price, description = excluded.description, updated_at = now();
  return query select true, null::text;
end;
$$;
grant execute on function public.list_factory_for_sale(bigint, numeric, text) to authenticated;

create or replace function public.unlist_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  delete from public.factory_listings where factory_id = p_factory_id and seller_id = v_uid;
  return query select true, null::text;
end;
$$;
grant execute on function public.unlist_factory(bigint) to authenticated;

create or replace function public.buy_factory(p_factory_id bigint)
returns table(out_success boolean, out_message text, out_price numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_listing record;
  v_buyer_balance numeric;
  v_buyer_count int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select count(*) into v_buyer_count from public.factory_occupations where user_id = v_uid;
  if v_buyer_count > 0 then return query select false, '이미 공장 보유 중 (1인 1공장)'::text, 0::numeric; return; end if;
  select * into v_listing from public.factory_listings where factory_id = p_factory_id for update;
  if v_listing.id is null then return query select false, '매도 등록되지 않은 공장'::text, 0::numeric; return; end if;
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

-- 위치 + 점거 + 매물 합쳐서
create or replace function public.list_factory_with_occupation()
returns table(
  id bigint, brand text, name text, address text, lat double precision, lng double precision,
  occupy_price numeric, daily_income numeric,
  occupier_id uuid, occupier_name text, occupied_at timestamptz, last_claimed_at timestamptz,
  listing_price numeric, listing_description text
)
language sql stable security definer set search_path = public as $$
  select
    f.id, f.brand, f.name, f.address, f.lat, f.lng,
    f.occupy_price, f.daily_income,
    o.user_id, p.display_name, o.occupied_at, o.last_claimed_at,
    l.price, l.description
  from public.factory_locations f
  left join public.factory_occupations o on o.factory_id = f.id
  left join public.profiles p on p.id = o.user_id
  left join public.factory_listings l on l.factory_id = f.id;
$$;
grant execute on function public.list_factory_with_occupation() to anon, authenticated;

create or replace function public.list_factory_comments(p_factory_id bigint, p_limit int default 50)
returns table(id bigint, author_id uuid, author_name text, content text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.author_id, p.display_name, c.content, c.created_at
  from public.factory_comments c
  left join public.profiles p on p.id = c.author_id
  where c.factory_id = p_factory_id and c.deleted_at is null
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
grant execute on function public.list_factory_comments(bigint, int) to anon, authenticated;
