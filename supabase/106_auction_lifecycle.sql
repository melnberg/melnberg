-- ──────────────────────────────────────────────
-- 106: 경매 라이프사이클 보강
-- 1) 경매 수정 RPC (시간 / 입찰가) — 어드민
-- 2) 경매 중지 RPC — 어드민
-- 3) 경매 중인 자산을 누군가 분양받으면 자동 중지 (occupy_emart/occupy_factory + apt 점거 트리거)
-- 4) 경매 완료/취소 시 텔레그램 알림 받을 수 있게 completed_at 활용 (피드는 list_recent_auctions
--    의 status='completed' 로 조회 가능)
-- ──────────────────────────────────────────────

-- 1) 시간 수정 — duration_minutes 또는 ends_at 직접
create or replace function public.update_auction_ends(p_auction_id bigint, p_new_ends_at timestamptz)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_auction record;
begin
  if v_uid is null then return query select false, '로그인 필요'::text; return; end if;
  select is_admin into v_is_admin from public.profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then return query select false, '어드민만 가능'::text; return; end if;
  select * into v_auction from public.apt_auctions where id = p_auction_id for update;
  if v_auction.id is null then return query select false, '경매를 찾을 수 없음'::text; return; end if;
  if v_auction.status <> 'active' then return query select false, '진행중인 경매만 수정 가능'::text; return; end if;
  if p_new_ends_at <= now() then return query select false, '종료 시각은 현재 이후여야 함'::text; return; end if;
  if p_new_ends_at > now() + interval '30 days' then return query select false, '종료 시각은 30일 이내'::text; return; end if;
  update public.apt_auctions set ends_at = p_new_ends_at where id = p_auction_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.update_auction_ends(bigint, timestamptz) to authenticated;

-- 2) 시작가 수정 — 입찰자 없을 때만
create or replace function public.update_auction_min_bid(p_auction_id bigint, p_new_min_bid numeric)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_auction record;
begin
  if v_uid is null then return query select false, '로그인 필요'::text; return; end if;
  select is_admin into v_is_admin from public.profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then return query select false, '어드민만 가능'::text; return; end if;
  if p_new_min_bid is null or p_new_min_bid <= 0 then return query select false, '시작가가 잘못됨'::text; return; end if;
  select * into v_auction from public.apt_auctions where id = p_auction_id for update;
  if v_auction.id is null then return query select false, '경매를 찾을 수 없음'::text; return; end if;
  if v_auction.status <> 'active' then return query select false, '진행중인 경매만 수정 가능'::text; return; end if;
  if v_auction.bid_count > 0 then return query select false, '이미 입찰자가 있어 시작가 수정 불가'::text; return; end if;
  update public.apt_auctions set min_bid = p_new_min_bid where id = p_auction_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.update_auction_min_bid(bigint, numeric) to authenticated;

-- 3) 경매 중지 — cancelled 로 마킹. 이미 입찰자 있어도 강제 취소 (mlbg 차감 안 됨).
create or replace function public.cancel_auction(p_auction_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_auction record;
begin
  if v_uid is null then return query select false, '로그인 필요'::text; return; end if;
  select is_admin into v_is_admin from public.profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then return query select false, '어드민만 가능'::text; return; end if;
  select * into v_auction from public.apt_auctions where id = p_auction_id for update;
  if v_auction.id is null then return query select false, '경매를 찾을 수 없음'::text; return; end if;
  if v_auction.status <> 'active' then return query select false, '이미 종료된 경매'::text; return; end if;
  update public.apt_auctions
    set status = 'cancelled', completed_at = now()
    where id = p_auction_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.cancel_auction(bigint) to authenticated;

-- 4) 자동 중지 트리거 — occupy 함수들 + apt_master occupier 변경 시 진행중 경매 cancel.
-- occupy_emart / buy_emart / occupy_factory / buy_factory 가 insert/update 하면 그 자산의
-- 진행중 경매를 cancelled 로.

create or replace function public.cancel_auctions_on_emart_occupy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.apt_auctions
    set status = 'cancelled', completed_at = now()
    where asset_type = 'emart' and asset_id = NEW.emart_id and status = 'active';
  return NEW;
end;
$$;
drop trigger if exists trg_cancel_auctions_on_emart_occupy on public.emart_occupations;
create trigger trg_cancel_auctions_on_emart_occupy
  after insert or update on public.emart_occupations
  for each row execute function public.cancel_auctions_on_emart_occupy();

create or replace function public.cancel_auctions_on_factory_occupy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.apt_auctions
    set status = 'cancelled', completed_at = now()
    where asset_type = 'factory' and asset_id = NEW.factory_id and status = 'active';
  return NEW;
end;
$$;
drop trigger if exists trg_cancel_auctions_on_factory_occupy on public.factory_occupations;
create trigger trg_cancel_auctions_on_factory_occupy
  after insert or update on public.factory_occupations
  for each row execute function public.cancel_auctions_on_factory_occupy();

-- apt_master.occupier_id 가 NULL → 누군가로 바뀌면 진행중 경매 취소
create or replace function public.cancel_auctions_on_apt_occupy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.occupier_id is not null and (OLD.occupier_id is null or OLD.occupier_id <> NEW.occupier_id) then
    update public.apt_auctions
      set status = 'cancelled', completed_at = now()
      where asset_type = 'apt' and asset_id = NEW.id and status = 'active';
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_cancel_auctions_on_apt_occupy on public.apt_master;
create trigger trg_cancel_auctions_on_apt_occupy
  after update of occupier_id on public.apt_master
  for each row execute function public.cancel_auctions_on_apt_occupy();

-- 단, complete_expired_auctions 가 점거 양도하면서 위 트리거가 발화 → 같은 경매 (그것 자체) 가
-- cancelled 로 덮어써질 수 있음. 막기 위해 트리거에 'auction_completion_in_progress' 세션 변수 가드.
create or replace function public.cancel_auctions_on_apt_occupy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.auction_completion_in_progress', true) = 'true' then
    return NEW;
  end if;
  if NEW.occupier_id is not null and (OLD.occupier_id is null or OLD.occupier_id <> NEW.occupier_id) then
    update public.apt_auctions
      set status = 'cancelled', completed_at = now()
      where asset_type = 'apt' and asset_id = NEW.id and status = 'active';
  end if;
  return NEW;
end;
$$;

create or replace function public.cancel_auctions_on_emart_occupy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.auction_completion_in_progress', true) = 'true' then
    return NEW;
  end if;
  update public.apt_auctions
    set status = 'cancelled', completed_at = now()
    where asset_type = 'emart' and asset_id = NEW.emart_id and status = 'active';
  return NEW;
end;
$$;

create or replace function public.cancel_auctions_on_factory_occupy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.auction_completion_in_progress', true) = 'true' then
    return NEW;
  end if;
  update public.apt_auctions
    set status = 'cancelled', completed_at = now()
    where asset_type = 'factory' and asset_id = NEW.factory_id and status = 'active';
  return NEW;
end;
$$;

-- complete_expired_auctions 재정의 — 가드 변수 set
create or replace function public.complete_expired_auctions()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_auction record;
  v_winner_balance numeric;
  v_prev_occupier uuid;
begin
  perform set_config('app.auction_completion_in_progress', 'true', true);
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
        update public.profiles
          set mlbg_balance = mlbg_balance - v_auction.current_bid
          where id = v_auction.current_bidder_id;

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
  perform set_config('app.auction_completion_in_progress', 'false', true);
  return v_count;
end;
$$;
grant execute on function public.complete_expired_auctions() to anon, authenticated;

-- 5) 알림 발송 추적용 컬럼 — 완료 알림 1회만
alter table public.apt_auctions
  add column if not exists notified_at timestamptz;

-- 5a) 미알림 완료 경매 pop — 한 행씩 atomic 마킹 (중복 알림 방지)
create or replace function public.pop_unnotified_completed_auctions(p_limit int default 20)
returns table(
  id bigint,
  asset_type text,
  asset_id bigint,
  asset_name text,
  current_bid numeric,
  current_bidder_id uuid,
  current_bidder_name text,
  bid_count int,
  completed_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  return query
    with picked as (
      update public.apt_auctions a
        set notified_at = now()
        where a.id in (
          select aa.id from public.apt_auctions aa
          where aa.status = 'completed'
            and aa.notified_at is null
            and aa.current_bidder_id is not null
            and aa.completed_at > now() - interval '6 hours'
          order by aa.completed_at asc
          limit greatest(1, least(coalesce(p_limit, 20), 100))
          for update skip locked
        )
        returning a.id, a.asset_type, a.asset_id, a.current_bid, a.current_bidder_id, a.bid_count, a.completed_at
    )
    select
      p.id, p.asset_type, p.asset_id,
      case p.asset_type
        when 'apt'     then am.apt_nm
        when 'factory' then fl.name
        when 'emart'   then el.name
      end as asset_name,
      p.current_bid, p.current_bidder_id, prof.display_name, p.bid_count, p.completed_at
    from picked p
    left join public.apt_master         am on p.asset_type = 'apt'     and am.id = p.asset_id
    left join public.factory_locations  fl on p.asset_type = 'factory' and fl.id = p.asset_id
    left join public.emart_locations    el on p.asset_type = 'emart'   and el.id = p.asset_id
    left join public.profiles prof on prof.id = p.current_bidder_id;
end;
$$;
grant execute on function public.pop_unnotified_completed_auctions(int) to anon, authenticated;

-- 6) 최근 완료된 경매 (피드 노출용) — 24시간 이내 completed
create or replace function public.list_recent_completed_auctions(p_limit int default 20)
returns table(
  id bigint, asset_type text, asset_id bigint, asset_name text,
  ends_at timestamptz, completed_at timestamptz,
  current_bid numeric, current_bidder_id uuid, current_bidder_name text,
  bid_count int
)
language sql stable security definer set search_path = public as $$
  select
    a.id, a.asset_type, a.asset_id,
    case a.asset_type
      when 'apt'     then am.apt_nm
      when 'factory' then fl.name
      when 'emart'   then el.name
    end as asset_name,
    a.ends_at, a.completed_at,
    a.current_bid, a.current_bidder_id, p.display_name,
    a.bid_count
  from public.apt_auctions a
  left join public.apt_master         am on a.asset_type = 'apt'     and am.id = a.asset_id
  left join public.factory_locations  fl on a.asset_type = 'factory' and fl.id = a.asset_id
  left join public.emart_locations    el on a.asset_type = 'emart'   and el.id = a.asset_id
  left join public.profiles p on p.id = a.current_bidder_id
  where a.status = 'completed'
    and a.completed_at > now() - interval '24 hours'
  order by a.completed_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.list_recent_completed_auctions(int) to anon, authenticated;

notify pgrst, 'reload schema';
