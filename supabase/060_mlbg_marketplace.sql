-- ──────────────────────────────────────────────
-- 060: 단지 P2P 매매 (자유시장)
-- 보유자가 가격을 걸어 매물로 등록 → 다른 사용자가 mlbg 차감하며 즉시 매수
-- 매수 시: 구매자 차감, 판매자 적립, occupier_id 이전, 이벤트 기록
-- ──────────────────────────────────────────────

-- 1) 이벤트 종류 확장 — 'sell' 추가
alter table public.apt_occupier_events drop constraint if exists apt_occupier_events_event_check;
alter table public.apt_occupier_events
  add constraint apt_occupier_events_event_check
  check (event in ('claim','evict','vacate','sell'));

-- 2) 매물 등록 테이블
create table if not exists public.apt_listings (
  apt_id bigint primary key references public.apt_master(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  price numeric not null check (price > 0),
  listed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_apt_listings_seller on public.apt_listings(seller_id);
create index if not exists idx_apt_listings_price on public.apt_listings(price);

alter table public.apt_listings enable row level security;
drop policy if exists "listings readable by all" on public.apt_listings;
create policy "listings readable by all"
  on public.apt_listings for select using (true);
-- INSERT/UPDATE/DELETE 는 RPC 만 (RLS 정책 없음 = 거부)

comment on table public.apt_listings is '단지 P2P 매물. 보유자만 등록·해제·가격 수정 가능 (RPC 경유).';

-- 3) 매물 등록·수정 RPC — 보유자만
create or replace function public.list_apt_for_sale(p_apt_id bigint, p_price numeric)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text; return;
  end if;
  if p_price is null or p_price <= 0 then
    return query select false, '가격은 0보다 커야 해요'::text; return;
  end if;
  select occupier_id into v_owner from public.apt_master where id = p_apt_id;
  if v_owner is null or v_owner <> v_uid then
    return query select false, '본인 보유 단지만 매물로 등록할 수 있어요'::text; return;
  end if;
  insert into public.apt_listings(apt_id, seller_id, price)
    values (p_apt_id, v_uid, p_price)
    on conflict (apt_id) do update
      set seller_id = excluded.seller_id,
          price = excluded.price,
          updated_at = now();
  return query select true, null::text;
end;
$$;
grant execute on function public.list_apt_for_sale(bigint, numeric) to authenticated;
comment on function public.list_apt_for_sale is '단지를 매물로 등록·가격 수정. 본인 보유 단지만 가능.';

-- 4) 매물 해제 RPC
create or replace function public.unlist_apt(p_apt_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text; return;
  end if;
  select seller_id into v_seller from public.apt_listings where apt_id = p_apt_id;
  if v_seller is null then
    return query select false, '매물이 아니에요'::text; return;
  end if;
  if v_seller <> v_uid then
    return query select false, '본인 매물만 해제할 수 있어요'::text; return;
  end if;
  delete from public.apt_listings where apt_id = p_apt_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.unlist_apt(bigint) to authenticated;

-- 5) 매수 RPC — atomic
create or replace function public.buy_apt(p_apt_id bigint)
returns table(
  out_success boolean,
  out_seller_id uuid,
  out_seller_name text,
  out_price numeric,
  out_message text
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_price numeric;
  v_owner uuid;
  v_buyer_balance numeric;
  v_seller_name text;
  v_buyer_name text;
begin
  if v_uid is null then
    return query select false, null::uuid, null::text, 0::numeric, '로그인이 필요해요'::text;
    return;
  end if;

  -- 매물 + 현재 점거인 lock
  select l.seller_id, l.price into v_seller, v_price
    from public.apt_listings l where l.apt_id = p_apt_id
    for update;
  if v_seller is null then
    return query select false, null::uuid, null::text, 0::numeric, '매물이 아니에요'::text;
    return;
  end if;
  if v_seller = v_uid then
    return query select false, v_seller, null::text, v_price, '본인 매물은 매수할 수 없어요'::text;
    return;
  end if;

  -- 현재 점거인 == seller 검증 (점거 변동된 경우 매물 무효화)
  select occupier_id into v_owner from public.apt_master where id = p_apt_id for update;
  if v_owner is null or v_owner <> v_seller then
    delete from public.apt_listings where apt_id = p_apt_id;
    return query select false, v_seller, null::text, v_price, '매물 정보가 변경되었어요. 새로고침 해주세요.'::text;
    return;
  end if;

  -- 매수자 잔액 검증
  select coalesce(mlbg_balance, 0) into v_buyer_balance from public.profiles where id = v_uid for update;
  if v_buyer_balance < v_price then
    return query select false, v_seller, null::text, v_price,
      ('잔액 부족 — 매가 ' || v_price || ' mlbg / 보유 ' || v_buyer_balance || ' mlbg')::text;
    return;
  end if;

  -- 거래 실행
  update public.profiles set mlbg_balance = mlbg_balance - v_price where id = v_uid;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_price where id = v_seller;
  update public.apt_master set occupier_id = v_uid, occupied_at = now() where id = p_apt_id;
  delete from public.apt_listings where apt_id = p_apt_id;

  select display_name into v_seller_name from public.profiles where id = v_seller;
  select display_name into v_buyer_name from public.profiles where id = v_uid;

  insert into public.apt_occupier_events(
    apt_id, event, actor_id, actor_name, prev_occupier_id, prev_occupier_name, actor_score, prev_score
  ) values (
    p_apt_id, 'sell', v_uid, v_buyer_name, v_seller, v_seller_name,
    v_price, v_price  -- score 칸을 매매가 기록용으로 재사용 (둘 다 가격 동일 — UI 에서 sell 이벤트는 가격으로 표시)
  );

  return query select true, v_seller, v_seller_name, v_price, null::text;
end;
$$;
grant execute on function public.buy_apt(bigint) to authenticated;
comment on function public.buy_apt is '단지 매수 — 잔액 차감·점거 이전·매물 해제·이벤트 기록을 atomic 하게.';

-- 6) 점거 변동 시 기존 매물 자동 해제 트리거 (claim·evict 등으로 occupier 가 바뀌면 매물 무효)
create or replace function public.cleanup_listing_on_owner_change()
returns trigger language plpgsql as $$
begin
  if (new.occupier_id is distinct from old.occupier_id) then
    delete from public.apt_listings where apt_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cleanup_listing_on_owner_change on public.apt_master;
create trigger trg_cleanup_listing_on_owner_change
  after update of occupier_id on public.apt_master
  for each row execute function public.cleanup_listing_on_owner_change();

-- 7) home-pins 용 view — listing 정보를 함께
create or replace view public.apt_master_with_listing as
  select am.*, l.price as listing_price, l.listed_at as listed_at
  from public.apt_master am
  left join public.apt_listings l on l.apt_id = am.id;

grant select on public.apt_master_with_listing to anon, authenticated;

-- 8) get_apt_history 확장 — sell 이벤트 표시 (기존 함수가 모든 이벤트 반환하므로 client 에서 처리)
