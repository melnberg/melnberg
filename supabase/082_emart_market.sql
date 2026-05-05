-- ──────────────────────────────────────────────
-- 082: 이마트 매도·매수 + 매장별 댓글
-- 1차: 매도가 즉시 매수 (호가 매칭은 차후)
-- ──────────────────────────────────────────────

-- 081 이 안 돌았어도 안전하게 — last_claimed_at 컬럼 보장
alter table public.emart_occupations
  add column if not exists last_claimed_at timestamptz;
update public.emart_occupations
  set last_claimed_at = occupied_at
  where last_claimed_at is null;

-- 매도 등록 — emart 당 1건만 (보유자 본인만 가능)
create table if not exists public.emart_listings (
  id bigserial primary key,
  emart_id bigint not null unique references public.emart_locations(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  price numeric not null check (price > 0),
  description text,
  listed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists emart_listings_seller_idx on public.emart_listings(seller_id);

alter table public.emart_listings enable row level security;
drop policy if exists "emart_listings readable by all" on public.emart_listings;
create policy "emart_listings readable by all" on public.emart_listings for select using (true);

-- 매장별 댓글
create table if not exists public.emart_comments (
  id bigserial primary key,
  emart_id bigint not null references public.emart_locations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists emart_comments_emart_idx on public.emart_comments(emart_id, created_at desc) where deleted_at is null;

alter table public.emart_comments enable row level security;
drop policy if exists "emart_comments readable by all" on public.emart_comments;
create policy "emart_comments readable by all" on public.emart_comments for select using (deleted_at is null);
drop policy if exists "emart_comments insert by self" on public.emart_comments;
create policy "emart_comments insert by self" on public.emart_comments for insert with check (auth.uid() = author_id);
drop policy if exists "emart_comments delete by author" on public.emart_comments;
create policy "emart_comments delete by author" on public.emart_comments for delete using (auth.uid() = author_id);

-- 매도 등록 — 보유자만, emart 당 1건
create or replace function public.list_emart_for_sale(p_emart_id bigint, p_price numeric, p_description text default null)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_desc text;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text; return;
  end if;
  if p_price is null or p_price <= 0 then
    return query select false, '가격이 잘못됐어요'::text; return;
  end if;
  select user_id into v_owner from public.emart_occupations where emart_id = p_emart_id;
  if v_owner is null or v_owner <> v_uid then
    return query select false, '본인 보유 매장만 매도 가능'::text; return;
  end if;
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_desc is not null and length(v_desc) > 1000 then v_desc := left(v_desc, 1000); end if;

  insert into public.emart_listings (emart_id, seller_id, price, description)
    values (p_emart_id, v_uid, p_price, v_desc)
    on conflict (emart_id) do update
      set seller_id = excluded.seller_id,
          price = excluded.price,
          description = excluded.description,
          updated_at = now();
  return query select true, null::text;
end;
$$;
grant execute on function public.list_emart_for_sale(bigint, numeric, text) to authenticated;

-- 매도 해제
create or replace function public.unlist_emart(p_emart_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text; return;
  end if;
  delete from public.emart_listings where emart_id = p_emart_id and seller_id = v_uid;
  return query select true, null::text;
end;
$$;
grant execute on function public.unlist_emart(bigint) to authenticated;

-- 즉시 매수 — 매도가 그대로. 1인 1점포 검증 + mlbg 차감/지급 + 점거자 양도.
create or replace function public.buy_emart(p_emart_id bigint)
returns table(out_success boolean, out_message text, out_price numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_listing record;
  v_buyer_balance numeric;
  v_seller_count int;
  v_buyer_count int;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text, 0::numeric; return;
  end if;

  -- 매수자가 이미 다른 이마트 보유? (1인 1점포)
  select count(*) into v_buyer_count from public.emart_occupations where user_id = v_uid;
  if v_buyer_count > 0 then
    return query select false, '이미 이마트를 보유 중이에요 (1인 1점포)'::text, 0::numeric; return;
  end if;

  select * into v_listing from public.emart_listings where emart_id = p_emart_id for update;
  if v_listing.id is null then
    return query select false, '매도 등록되지 않은 매장이에요'::text, 0::numeric; return;
  end if;
  if v_listing.seller_id = v_uid then
    return query select false, '본인 매물은 못 사요'::text, 0::numeric; return;
  end if;

  select coalesce(mlbg_balance, 0) into v_buyer_balance from public.profiles where id = v_uid for update;
  if v_buyer_balance < v_listing.price then
    return query select false, ('mlbg 부족 — 현재 ' || v_buyer_balance || ', 가격 ' || v_listing.price)::text, 0::numeric; return;
  end if;

  -- 매수자 차감
  update public.profiles set mlbg_balance = mlbg_balance - v_listing.price where id = v_uid;
  -- 매도자 입금
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_listing.price where id = v_listing.seller_id;
  -- 점거 양도 — 기존 occupation 의 user 변경
  update public.emart_occupations
    set user_id = v_uid, occupied_at = now(), last_claimed_at = now()
    where emart_id = p_emart_id;
  -- 매물 제거
  delete from public.emart_listings where emart_id = p_emart_id;

  return query select true, null::text, v_listing.price;
end;
$$;
grant execute on function public.buy_emart(bigint) to authenticated;

-- list_emart_with_occupation 확장 — 매도가 / 매도설명 포함
drop function if exists public.list_emart_with_occupation();
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
  occupied_at timestamptz,
  last_claimed_at timestamptz,
  listing_price numeric,
  listing_description text
)
language sql stable security definer set search_path = public as $$
  select
    e.id, e.kakao_place_id, e.name, e.address, e.lat, e.lng,
    o.user_id as occupier_id,
    p.display_name as occupier_name,
    o.occupied_at,
    o.last_claimed_at,
    l.price as listing_price,
    l.description as listing_description
  from public.emart_locations e
  left join public.emart_occupations o on o.emart_id = e.id
  left join public.profiles p on p.id = o.user_id
  left join public.emart_listings l on l.emart_id = e.id;
$$;
grant execute on function public.list_emart_with_occupation() to anon, authenticated;

-- 매장별 댓글 fetch
create or replace function public.list_emart_comments(p_emart_id bigint, p_limit int default 50)
returns table(
  id bigint,
  author_id uuid,
  author_name text,
  content text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, c.author_id, p.display_name as author_name, c.content, c.created_at
  from public.emart_comments c
  left join public.profiles p on p.id = c.author_id
  where c.emart_id = p_emart_id and c.deleted_at is null
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
grant execute on function public.list_emart_comments(bigint, int) to anon, authenticated;
