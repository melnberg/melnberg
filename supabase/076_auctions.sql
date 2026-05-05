-- ──────────────────────────────────────────────
-- 076: 시한 경매 — 어드민이 단지를 시한 경매로 등록, 사용자 입찰
-- 안티-스나이프: 종료 5분 전 입찰 시 ends_at +5min 자동 연장
-- 종료 시 winner 에게 단지 점거 양도 + mlbg 차감. bid 단계에선 차감 X (잔액 검증만).
-- ──────────────────────────────────────────────

create table if not exists public.apt_auctions (
  id bigserial primary key,
  apt_id bigint not null references public.apt_master(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  min_bid numeric not null check (min_bid > 0),
  current_bid numeric,
  current_bidder_id uuid references auth.users(id),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  bid_count int not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists apt_auctions_active_idx on public.apt_auctions(status, ends_at) where status = 'active';
create index if not exists apt_auctions_apt_idx on public.apt_auctions(apt_id);

create table if not exists public.auction_bids (
  id bigserial primary key,
  auction_id bigint not null references public.apt_auctions(id) on delete cascade,
  bidder_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists auction_bids_auction_idx on public.auction_bids(auction_id, created_at desc);

alter table public.apt_auctions enable row level security;
alter table public.auction_bids enable row level security;

drop policy if exists "auctions readable by all" on public.apt_auctions;
create policy "auctions readable by all" on public.apt_auctions for select using (true);

drop policy if exists "auction_bids readable by all" on public.auction_bids;
create policy "auction_bids readable by all" on public.auction_bids for select using (true);

-- 어드민만 INSERT (UI 경유, RPC 안 거치는 직접 INSERT 막음)
drop policy if exists "auctions insert by admin" on public.apt_auctions;
create policy "auctions insert by admin" on public.apt_auctions for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "auctions update by admin" on public.apt_auctions;
create policy "auctions update by admin" on public.apt_auctions for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- 입찰 RPC — 검증 + bid 기록 + auction 갱신 + 안티스나이프 연장
create or replace function public.place_auction_bid(p_auction_id bigint, p_amount numeric)
returns table(out_success boolean, out_message text, out_new_ends_at timestamptz, out_extended boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_auction record;
  v_balance numeric;
  v_new_ends timestamptz;
  v_extended boolean := false;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text, null::timestamptz, false; return;
  end if;
  if p_amount is null or p_amount <= 0 then
    return query select false, '입찰 금액이 잘못되었어요'::text, null::timestamptz, false; return;
  end if;

  select * into v_auction from public.apt_auctions where id = p_auction_id for update;
  if v_auction.id is null then
    return query select false, '경매를 찾을 수 없어요'::text, null::timestamptz, false; return;
  end if;
  if v_auction.status <> 'active' then
    return query select false, '이미 종료된 경매예요'::text, null::timestamptz, false; return;
  end if;
  if now() >= v_auction.ends_at then
    return query select false, '경매 시간이 만료됐어요'::text, null::timestamptz, false; return;
  end if;
  if now() < v_auction.starts_at then
    return query select false, '아직 시작 전이에요'::text, null::timestamptz, false; return;
  end if;

  -- 자기 글에 본인이 입찰? 막지 않음 (어드민이 등록한 경매라 무관)

  -- 입찰가 검증: min_bid 이상 + 현재가보다 높아야
  if p_amount < v_auction.min_bid then
    return query select false, ('최소 입찰가 ' || v_auction.min_bid || ' mlbg 이상')::text, null::timestamptz, false; return;
  end if;
  if v_auction.current_bid is not null and p_amount <= v_auction.current_bid then
    return query select false, ('현재 최고가 ' || v_auction.current_bid || ' mlbg 보다 높여야 해요')::text, null::timestamptz, false; return;
  end if;

  -- 잔액 검증 (실차감은 종료 시점)
  select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid;
  if v_balance < p_amount then
    return query select false, ('mlbg 부족 — 현재 ' || v_balance || ', 입찰 ' || p_amount)::text, null::timestamptz, false; return;
  end if;

  -- 안티스나이프: 종료 5분 전 입찰 → +5분 연장
  v_new_ends := v_auction.ends_at;
  if v_auction.ends_at - now() < interval '5 minutes' then
    v_new_ends := now() + interval '5 minutes';
    v_extended := true;
  end if;

  insert into public.auction_bids (auction_id, bidder_id, amount)
    values (p_auction_id, v_uid, p_amount);

  update public.apt_auctions
    set current_bid = p_amount,
        current_bidder_id = v_uid,
        bid_count = bid_count + 1,
        ends_at = v_new_ends
    where id = p_auction_id;

  return query select true, null::text, v_new_ends, v_extended;
end;
$$;

grant execute on function public.place_auction_bid(bigint, numeric) to authenticated;

-- 경매 종료 처리 — winner 에게 단지 점거 양도 + mlbg 차감.
-- 누구나 호출 가능 (cron 또는 사용자 첫 방문 트리거). 이미 종료된 경매면 no-op.
create or replace function public.complete_expired_auctions()
returns int
language plpgsql
security definer
set search_path = public
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
    -- winner 가 있고 잔액 충분하면 양도
    if v_auction.current_bidder_id is not null then
      select coalesce(mlbg_balance, 0) into v_winner_balance
        from public.profiles where id = v_auction.current_bidder_id for update;
      if v_winner_balance >= v_auction.current_bid then
        -- mlbg 차감
        update public.profiles
          set mlbg_balance = mlbg_balance - v_auction.current_bid
          where id = v_auction.current_bidder_id;
        -- 단지 점거 양도
        select occupier_id into v_prev_occupier from public.apt_master where id = v_auction.apt_id;
        update public.apt_master
          set occupier_id = v_auction.current_bidder_id, occupied_at = now()
          where id = v_auction.apt_id;
        -- 점거 이벤트 기록 (있으면)
        begin
          insert into public.apt_occupier_events (apt_id, event, actor_id, prev_occupier_id, actor_score)
            values (v_auction.apt_id, 'occupy', v_auction.current_bidder_id, v_prev_occupier, v_auction.current_bid);
        exception when others then null;
        end;
        update public.apt_auctions
          set status = 'completed', completed_at = now()
          where id = v_auction.id;
      else
        -- winner 잔액 부족 → 경매 무효 (cancelled)
        update public.apt_auctions
          set status = 'cancelled', completed_at = now()
          where id = v_auction.id;
      end if;
    else
      -- 입찰자 없음 → cancelled
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

-- 어드민이 경매 생성 시 호출 (RLS 정책으로 admin 만 통과)
-- duration_minutes: 경매 진행 시간 (분 단위)
create or replace function public.create_auction(p_apt_id bigint, p_duration_minutes int, p_min_bid numeric)
returns table(out_success boolean, out_auction_id bigint, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_id bigint;
begin
  if v_uid is null then
    return query select false, null::bigint, '로그인이 필요해요'::text; return;
  end if;
  select is_admin into v_is_admin from public.profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then
    return query select false, null::bigint, '어드민만 경매 생성 가능'::text; return;
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 1440 then
    return query select false, null::bigint, '진행 시간은 5분~1440분 (24시간) 이내'::text; return;
  end if;
  if p_min_bid is null or p_min_bid <= 0 then
    return query select false, null::bigint, '최소 입찰가가 잘못됨'::text; return;
  end if;

  insert into public.apt_auctions (apt_id, starts_at, ends_at, min_bid, created_by)
    values (p_apt_id, now(), now() + (p_duration_minutes || ' minutes')::interval, p_min_bid, v_uid)
    returning id into v_id;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.create_auction(bigint, int, numeric) to authenticated;

-- 진행중 + 최근 종료 경매 조회 (UI 리스트용)
create or replace function public.list_recent_auctions(p_limit int default 20)
returns table(
  id bigint, apt_id bigint, apt_nm text,
  starts_at timestamptz, ends_at timestamptz,
  min_bid numeric, current_bid numeric, current_bidder_name text,
  status text, bid_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.apt_id, am.apt_nm,
    a.starts_at, a.ends_at,
    a.min_bid, a.current_bid,
    p.display_name as current_bidder_name,
    a.status, a.bid_count
  from public.apt_auctions a
  left join public.apt_master am on am.id = a.apt_id
  left join public.profiles p on p.id = a.current_bidder_id
  order by
    case when a.status = 'active' then 0 else 1 end,
    a.ends_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.list_recent_auctions(int) to anon, authenticated;
