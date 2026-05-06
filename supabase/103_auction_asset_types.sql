-- ──────────────────────────────────────────────
-- 103: 시한 경매 자산 타입 확장
-- 단지(apt) 외에 공장(factory: 하이닉스/삼성/코스트코/금속노조/화물연대/터미널/기차역)
-- 과 상업시설(emart) 도 경매 가능.
--
-- 설계:
--   - apt_auctions 에 asset_type ('apt'|'factory'|'emart') + asset_id 추가
--   - apt_id 컬럼은 nullable + 백워드 호환 (apt 타입일 때만 값 채움)
--   - place_auction_bid 는 변경 없음 (auction_id + amount 만 다룸)
--   - complete_expired_auctions, create_auction, list_recent_auctions 는 asset_type 별 분기
--   - 점거 양도: factory_occupations / emart_occupations 에 upsert (1인 보유 제한은
--     occupy_* RPC 에만 적용. 경매 낙찰은 어드민 등록 → 입찰자 책임으로 4개 한도 체크 skip)
-- ──────────────────────────────────────────────

-- 1) 컬럼 추가
alter table public.apt_auctions
  add column if not exists asset_type text;
alter table public.apt_auctions
  add column if not exists asset_id bigint;

-- 2) 기존 row 백필 — 모두 'apt' 타입
update public.apt_auctions
  set asset_type = 'apt', asset_id = apt_id
  where asset_type is null;

-- 3) NOT NULL + CHECK 부여 (백필 후)
alter table public.apt_auctions alter column asset_type set not null;
alter table public.apt_auctions alter column asset_type set default 'apt';
alter table public.apt_auctions alter column asset_id set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'apt_auctions_asset_type_check') then
    alter table public.apt_auctions
      add constraint apt_auctions_asset_type_check check (asset_type in ('apt', 'factory', 'emart'));
  end if;
end $$;

-- 4) apt_id nullable 로 (factory/emart 타입은 null)
alter table public.apt_auctions alter column apt_id drop not null;

-- 5) 인덱스
create index if not exists apt_auctions_asset_active_idx
  on public.apt_auctions(asset_type, asset_id)
  where status = 'active';

-- 6) create_auction 재정의 — asset_type/asset_id 시그니처
drop function if exists public.create_auction(bigint, int, numeric, timestamptz);
drop function if exists public.create_auction(bigint, int, numeric);
create or replace function public.create_auction(
  p_asset_type text,
  p_asset_id bigint,
  p_duration_minutes int,
  p_min_bid numeric,
  p_starts_at timestamptz default null
)
returns table(out_success boolean, out_auction_id bigint, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_id bigint;
  v_starts timestamptz;
  v_existing_active int;
  v_apt_nm text; v_apt_occ uuid;
  v_factory_nm text; v_factory_occ_count int;
  v_emart_nm text; v_emart_occ_count int;
begin
  if v_uid is null then
    return query select false, null::bigint, '로그인이 필요해요'::text; return;
  end if;
  select is_admin into v_is_admin from public.profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then
    return query select false, null::bigint, '어드민만 경매 생성 가능'::text; return;
  end if;
  if p_asset_type not in ('apt', 'factory', 'emart') then
    return query select false, null::bigint, '자산 타입은 apt/factory/emart 중 하나'::text; return;
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 1440 then
    return query select false, null::bigint, '진행 시간은 5분~1440분 (24시간) 이내'::text; return;
  end if;
  if p_min_bid is null or p_min_bid <= 0 then
    return query select false, null::bigint, '최소 입찰가가 잘못됨'::text; return;
  end if;

  v_starts := coalesce(p_starts_at, now());
  if v_starts < now() - interval '1 minute' then v_starts := now(); end if;
  if v_starts > now() + interval '30 days' then
    return query select false, null::bigint, '시작 시각은 30일 이내'::text; return;
  end if;

  -- 자산별 존재 + 점거 검증
  if p_asset_type = 'apt' then
    select occupier_id, apt_nm into v_apt_occ, v_apt_nm from public.apt_master where id = p_asset_id;
    if v_apt_nm is null then return query select false, null::bigint, '존재하지 않는 단지'::text; return; end if;
    if v_apt_occ is not null then return query select false, null::bigint, ('이미 점거된 단지: ' || v_apt_nm)::text; return; end if;
  elsif p_asset_type = 'factory' then
    select name into v_factory_nm from public.factory_locations where id = p_asset_id;
    if v_factory_nm is null then return query select false, null::bigint, '존재하지 않는 시설'::text; return; end if;
    select count(*) into v_factory_occ_count from public.factory_occupations where factory_id = p_asset_id;
    if v_factory_occ_count > 0 then return query select false, null::bigint, ('이미 점거된 시설: ' || v_factory_nm)::text; return; end if;
  elsif p_asset_type = 'emart' then
    select name into v_emart_nm from public.emart_locations where id = p_asset_id;
    if v_emart_nm is null then return query select false, null::bigint, '존재하지 않는 매장'::text; return; end if;
    select count(*) into v_emart_occ_count from public.emart_occupations where emart_id = p_asset_id;
    if v_emart_occ_count > 0 then return query select false, null::bigint, ('이미 점거된 매장: ' || v_emart_nm)::text; return; end if;
  end if;

  -- 같은 자산 진행중 경매 중복 차단
  select count(*) into v_existing_active
    from public.apt_auctions
    where asset_type = p_asset_type and asset_id = p_asset_id and status = 'active';
  if v_existing_active > 0 then
    return query select false, null::bigint, '이미 진행 중인 경매가 있는 자산'::text; return;
  end if;

  -- apt_id 컬럼은 apt 타입에만 채움 (백워드 호환).
  insert into public.apt_auctions (apt_id, asset_type, asset_id, starts_at, ends_at, min_bid, created_by)
    values (
      case when p_asset_type = 'apt' then p_asset_id else null end,
      p_asset_type,
      p_asset_id,
      v_starts,
      v_starts + (p_duration_minutes || ' minutes')::interval,
      p_min_bid,
      v_uid
    )
    returning id into v_id;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.create_auction(text, bigint, int, numeric, timestamptz) to authenticated;

-- 7) complete_expired_auctions — asset_type 별로 점거 양도 분기
create or replace function public.complete_expired_auctions()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int := 0;
  v_auction record;
  v_winner_balance numeric;
  v_prev_occupier uuid;
begin
  for v_auction in
    select * from public.apt_auctions
    where status = 'active' and ends_at <= now()
    order by ends_at asc
    for update skip locked
    limit 50
  loop
    if v_auction.current_bidder_id is not null then
      select coalesce(mlbg_balance, 0) into v_winner_balance
        from public.profiles where id = v_auction.current_bidder_id for update;
      if v_winner_balance >= v_auction.current_bid then
        -- mlbg 차감
        update public.profiles
          set mlbg_balance = mlbg_balance - v_auction.current_bid
          where id = v_auction.current_bidder_id;

        -- 자산 타입별 점거 양도
        if v_auction.asset_type = 'apt' then
          select occupier_id into v_prev_occupier from public.apt_master where id = v_auction.asset_id;
          update public.apt_master
            set occupier_id = v_auction.current_bidder_id, occupied_at = now()
            where id = v_auction.asset_id;
          begin
            insert into public.apt_occupier_events (apt_id, event, actor_id, prev_occupier_id, actor_score)
              values (v_auction.asset_id, 'occupy', v_auction.current_bidder_id, v_prev_occupier, v_auction.current_bid);
          exception when others then null;
          end;
        elsif v_auction.asset_type = 'factory' then
          insert into public.factory_occupations (factory_id, user_id, occupied_at, last_claimed_at)
            values (v_auction.asset_id, v_auction.current_bidder_id, now(), now())
            on conflict (factory_id) do update
              set user_id = excluded.user_id, occupied_at = now(), last_claimed_at = now();
        elsif v_auction.asset_type = 'emart' then
          insert into public.emart_occupations (emart_id, user_id, occupied_at)
            values (v_auction.asset_id, v_auction.current_bidder_id, now())
            on conflict (emart_id) do update
              set user_id = excluded.user_id, occupied_at = now();
        end if;

        update public.apt_auctions
          set status = 'completed', completed_at = now()
          where id = v_auction.id;
      else
        update public.apt_auctions
          set status = 'cancelled', completed_at = now()
          where id = v_auction.id;
      end if;
    else
      update public.apt_auctions
        set status = 'cancelled', completed_at = now()
        where id = v_auction.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.complete_expired_auctions() to anon, authenticated;

-- 8) list_recent_auctions — asset_name 포함, 타입별 join
drop function if exists public.list_recent_auctions(int);
create or replace function public.list_recent_auctions(p_limit int default 20)
returns table(
  id bigint,
  asset_type text,
  asset_id bigint,
  asset_name text,
  apt_id bigint,        -- 백워드 호환
  apt_nm text,          -- 백워드 호환 (apt 타입에만 채워짐)
  starts_at timestamptz,
  ends_at timestamptz,
  min_bid numeric,
  current_bid numeric,
  current_bidder_name text,
  status text,
  bid_count int
)
language sql stable security definer set search_path = public as $$
  select
    a.id,
    a.asset_type,
    a.asset_id,
    case a.asset_type
      when 'apt'     then am.apt_nm
      when 'factory' then fl.name
      when 'emart'   then el.name
    end as asset_name,
    a.apt_id,
    am.apt_nm,
    a.starts_at, a.ends_at,
    a.min_bid, a.current_bid,
    p.display_name as current_bidder_name,
    a.status, a.bid_count
  from public.apt_auctions a
  left join public.apt_master         am on a.asset_type = 'apt'     and am.id = a.asset_id
  left join public.factory_locations  fl on a.asset_type = 'factory' and fl.id = a.asset_id
  left join public.emart_locations    el on a.asset_type = 'emart'   and el.id = a.asset_id
  left join public.profiles p on p.id = a.current_bidder_id
  order by
    case when a.status = 'active' then 0 else 1 end,
    a.ends_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.list_recent_auctions(int) to anon, authenticated;

notify pgrst, 'reload schema';
