-- ──────────────────────────────────────────────
-- 067: 매물 인터랙션 — 댓글·매수 호가·내놔(snatch)
-- 매물 등록된 단지에서 다른 회원이 할 수 있는 액션 3가지:
--   1. 매물 댓글 (apt_listing_comments)
--   2. 매수 호가 제시 (apt_listing_offers, kind='offer') — 매도자 수락 시 그 가격으로 거래
--   3. 내놔 (apt_listing_offers, kind='snatch') — 매도자 수락 시 무상 이전
-- ──────────────────────────────────────────────

-- ── 1. 매물 댓글 테이블 ────────────────────────────
create table if not exists public.apt_listing_comments (
  id bigserial primary key,
  apt_id bigint not null references public.apt_master(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  content text not null check (length(content) > 0 and length(content) <= 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_listing_comments_apt on public.apt_listing_comments(apt_id, created_at desc) where deleted_at is null;

alter table public.apt_listing_comments enable row level security;

drop policy if exists "listing_comments readable by all" on public.apt_listing_comments;
create policy "listing_comments readable by all"
  on public.apt_listing_comments for select using (true);

drop policy if exists "listing_comments insert by self" on public.apt_listing_comments;
create policy "listing_comments insert by self"
  on public.apt_listing_comments for insert with check (auth.uid() = author_id);

drop policy if exists "listing_comments update by author" on public.apt_listing_comments;
create policy "listing_comments update by author"
  on public.apt_listing_comments for update using (auth.uid() = author_id);

comment on table public.apt_listing_comments is '매물에 대한 댓글. 매물 해제·매매 후에도 보존 (deleted_at soft delete).';

-- ── 2. 매수 호가 / 내놔 (snatch) 테이블 ─────────────
create table if not exists public.apt_listing_offers (
  id bigserial primary key,
  apt_id bigint not null references public.apt_master(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  price numeric not null check (price >= 0),
  kind text not null check (kind in ('offer', 'snatch')),
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_offers_apt_pending on public.apt_listing_offers(apt_id, created_at desc) where status = 'pending';
create index if not exists idx_offers_buyer on public.apt_listing_offers(buyer_id, created_at desc);

alter table public.apt_listing_offers enable row level security;

drop policy if exists "offers readable by participants" on public.apt_listing_offers;
create policy "offers readable by participants"
  on public.apt_listing_offers for select using (
    auth.uid() = buyer_id or auth.uid() = seller_id
  );

-- INSERT/UPDATE 는 RPC 만 (정책 없음 = 거부)

comment on table public.apt_listing_offers is '매수 호가 또는 내놔(snatch) 요청. 매도자가 수락 시 atomic 거래 실행.';

-- ── 3. 매물 댓글 RPC ─────────────────────────────
create or replace function public.add_listing_comment(p_apt_id bigint, p_content text)
returns table(out_success boolean, out_id bigint, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id bigint;
  v_text text := nullif(trim(coalesce(p_content, '')), '');
begin
  if v_uid is null then return query select false, null::bigint, '로그인이 필요해요'::text; return; end if;
  if v_text is null then return query select false, null::bigint, '내용을 입력하세요'::text; return; end if;
  if length(v_text) > 1000 then v_text := left(v_text, 1000); end if;

  insert into public.apt_listing_comments(apt_id, author_id, content)
    values (p_apt_id, v_uid, v_text)
    returning id into v_id;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.add_listing_comment(bigint, text) to authenticated;

create or replace function public.delete_listing_comment(p_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select author_id into v_author from public.apt_listing_comments where id = p_id;
  if v_author is null then return query select false, '댓글을 찾을 수 없어요'::text; return; end if;
  if v_author <> v_uid then return query select false, '본인 댓글만 삭제할 수 있어요'::text; return; end if;
  update public.apt_listing_comments set deleted_at = now() where id = p_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.delete_listing_comment(bigint) to authenticated;

-- ── 4. 매수 호가 / 내놔 RPC ───────────────────────
create or replace function public.make_offer(p_apt_id bigint, p_price numeric, p_kind text, p_message text default null)
returns table(out_success boolean, out_id bigint, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_balance numeric;
  v_id bigint;
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
begin
  if v_uid is null then return query select false, null::bigint, '로그인이 필요해요'::text; return; end if;
  if p_kind not in ('offer', 'snatch') then
    return query select false, null::bigint, 'kind 는 offer 또는 snatch'::text; return;
  end if;

  -- 현재 점거인 = 매도 후보. 본인 매물에는 호가 못 함.
  select occupier_id into v_owner from public.apt_master where id = p_apt_id;
  if v_owner is null then
    return query select false, null::bigint, '점거자가 없는 단지에는 호가할 수 없어요'::text; return;
  end if;
  if v_owner = v_uid then
    return query select false, null::bigint, '본인 보유 단지에는 호가할 수 없어요'::text; return;
  end if;

  -- offer 는 가격 > 0 강제, snatch 는 가격 0 (무상 이전 요청)
  if p_kind = 'offer' and (p_price is null or p_price <= 0) then
    return query select false, null::bigint, '매수 호가는 0보다 커야 해요'::text; return;
  end if;
  if p_kind = 'snatch' then
    p_price := 0;
  end if;

  -- 매수자 잔액 검증 (offer 만 — snatch 는 잔액 무관)
  if p_kind = 'offer' then
    select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid;
    if v_balance < p_price then
      return query select false, null::bigint,
        ('잔액 부족 — 호가 ' || p_price || ' mlbg / 보유 ' || v_balance || ' mlbg')::text;
      return;
    end if;
  end if;

  if v_msg is not null and length(v_msg) > 500 then v_msg := left(v_msg, 500); end if;

  insert into public.apt_listing_offers(apt_id, buyer_id, seller_id, price, kind, message)
    values (p_apt_id, v_uid, v_owner, p_price, p_kind, v_msg)
    returning id into v_id;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.make_offer(bigint, numeric, text, text) to authenticated;

create or replace function public.accept_offer(p_offer_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_apt_id bigint;
  v_buyer uuid;
  v_seller uuid;
  v_price numeric;
  v_kind text;
  v_owner uuid;
  v_buyer_balance numeric;
  v_seller_name text;
  v_buyer_name text;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;

  select apt_id, buyer_id, seller_id, price, kind, status
    into v_apt_id, v_buyer, v_seller, v_price, v_kind, v_owner   -- v_owner 임시 재사용 (status 검증용)
    from public.apt_listing_offers where id = p_offer_id for update;

  if v_apt_id is null then return query select false, '호가를 찾을 수 없어요'::text; return; end if;
  -- v_owner 가 status 임 (재사용). 검증.
  if v_owner::text <> 'pending' then
    return query select false, '이미 처리된 호가입니다'::text; return;
  end if;

  -- 현재 점거인 = 호출자 검증
  select occupier_id into v_owner from public.apt_master where id = v_apt_id for update;
  if v_owner is null or v_owner <> v_uid then
    return query select false, '본인 보유 단지의 호가만 수락 가능'::text; return;
  end if;
  if v_seller <> v_uid then
    -- 호가 등록 후 점거인 변경 — supersede 처리
    update public.apt_listing_offers set status = 'superseded', resolved_at = now() where id = p_offer_id;
    return query select false, '호가 등록 이후 점거인이 바뀌어 호가가 무효화됐어요'::text; return;
  end if;

  -- 매수자 잔액 재검증 (offer 만)
  if v_kind = 'offer' then
    select coalesce(mlbg_balance, 0) into v_buyer_balance from public.profiles where id = v_buyer for update;
    if v_buyer_balance < v_price then
      update public.apt_listing_offers set status = 'rejected', resolved_at = now() where id = p_offer_id;
      return query select false, ('매수자 잔액 부족 — 호가 자동 거절')::text; return;
    end if;
  end if;

  -- 거래 실행 (atomic)
  if v_kind = 'offer' and v_price > 0 then
    update public.profiles set mlbg_balance = mlbg_balance - v_price where id = v_buyer;
    update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_price where id = v_seller;
  end if;
  -- snatch: 가격 이동 없음. 점거만 이전.

  update public.apt_master set occupier_id = v_buyer, occupied_at = now() where id = v_apt_id;
  delete from public.apt_listings where apt_id = v_apt_id;

  -- 같은 단지의 다른 pending 호가 모두 superseded 처리
  update public.apt_listing_offers
    set status = 'superseded', resolved_at = now()
    where apt_id = v_apt_id and status = 'pending' and id <> p_offer_id;

  -- 이 호가 accepted
  update public.apt_listing_offers set status = 'accepted', resolved_at = now() where id = p_offer_id;

  -- 이벤트 기록 (sell — apt_occupier_events.actor_score 칸을 가격 기록용으로 재사용)
  select display_name into v_seller_name from public.profiles where id = v_seller;
  select display_name into v_buyer_name from public.profiles where id = v_buyer;
  insert into public.apt_occupier_events(
    apt_id, event, actor_id, actor_name, prev_occupier_id, prev_occupier_name, actor_score, prev_score
  ) values (
    v_apt_id, 'sell', v_buyer, v_buyer_name, v_seller, v_seller_name, v_price, v_price
  );

  return query select true, null::text;
end;
$$;
grant execute on function public.accept_offer(bigint) to authenticated;

create or replace function public.reject_offer(p_offer_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_status text;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select seller_id, status into v_seller, v_status from public.apt_listing_offers where id = p_offer_id;
  if v_seller is null then return query select false, '호가를 찾을 수 없어요'::text; return; end if;
  if v_seller <> v_uid then return query select false, '본인이 받은 호가만 거절 가능'::text; return; end if;
  if v_status <> 'pending' then return query select false, '이미 처리된 호가'::text; return; end if;
  update public.apt_listing_offers set status = 'rejected', resolved_at = now() where id = p_offer_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.reject_offer(bigint) to authenticated;

create or replace function public.cancel_offer(p_offer_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_buyer uuid;
  v_status text;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select buyer_id, status into v_buyer, v_status from public.apt_listing_offers where id = p_offer_id;
  if v_buyer is null then return query select false, '호가를 찾을 수 없어요'::text; return; end if;
  if v_buyer <> v_uid then return query select false, '본인이 낸 호가만 취소 가능'::text; return; end if;
  if v_status <> 'pending' then return query select false, '이미 처리됨'::text; return; end if;
  update public.apt_listing_offers set status = 'cancelled', resolved_at = now() where id = p_offer_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.cancel_offer(bigint) to authenticated;

-- ── 5. 점거 변동 시 pending offers 자동 정리 ─────
create or replace function public.cleanup_offers_on_owner_change()
returns trigger language plpgsql as $$
begin
  if (new.occupier_id is distinct from old.occupier_id) then
    update public.apt_listing_offers
      set status = 'superseded', resolved_at = now()
      where apt_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cleanup_offers_on_owner_change on public.apt_master;
create trigger trg_cleanup_offers_on_owner_change
  after update of occupier_id on public.apt_master
  for each row execute function public.cleanup_offers_on_owner_change();
