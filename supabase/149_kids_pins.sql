-- ──────────────────────────────────────────────
-- 149: 사용자 등록 육아 장소 핀 (kids_pins) — 142(restaurant_pins) 와 동일 구조
-- 등록 +30 mlbg / 분양 100 / 일 수익 1 / 1인 5개 / 사진 필수
-- 필수 필드: name, description, recommended_activity (추천 액티비티)
-- ──────────────────────────────────────────────

create table if not exists public.kids_pins (
  id bigserial primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 40),
  description text not null check (length(trim(description)) > 0 and length(description) <= 200),
  recommended_activity text not null check (length(trim(recommended_activity)) > 0 and length(recommended_activity) <= 200),
  lat numeric not null,
  lng numeric not null,
  photo_url text,
  address text,
  dong text,
  occupy_price numeric not null default 100,
  daily_income numeric not null default 1,
  like_count int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists kids_pins_recent_idx on public.kids_pins(created_at desc) where deleted_at is null;
create index if not exists kids_pins_author_idx on public.kids_pins(author_id) where deleted_at is null;

alter table public.kids_pins enable row level security;
drop policy if exists "kids_pins readable by all" on public.kids_pins;
create policy "kids_pins readable by all" on public.kids_pins for select using (deleted_at is null);
drop policy if exists "kids_pins author update" on public.kids_pins;
create policy "kids_pins author update" on public.kids_pins for update using (auth.uid() = author_id);

create table if not exists public.kids_pin_likes (
  pin_id bigint not null references public.kids_pins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);
create index if not exists kids_pin_likes_pin_idx on public.kids_pin_likes(pin_id);
alter table public.kids_pin_likes enable row level security;
drop policy if exists "kids_pin_likes readable by all" on public.kids_pin_likes;
create policy "kids_pin_likes readable by all" on public.kids_pin_likes for select using (true);

create table if not exists public.kids_pin_comments (
  id bigserial primary key,
  pin_id bigint not null references public.kids_pins(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists kids_pin_comments_pin_idx on public.kids_pin_comments(pin_id, created_at) where deleted_at is null;
alter table public.kids_pin_comments enable row level security;
drop policy if exists "kids_pin_comments readable by all" on public.kids_pin_comments;
create policy "kids_pin_comments readable by all" on public.kids_pin_comments for select using (deleted_at is null);
drop policy if exists "kids_pin_comments own insert" on public.kids_pin_comments;
create policy "kids_pin_comments own insert" on public.kids_pin_comments for insert with check (auth.uid() = author_id);
drop policy if exists "kids_pin_comments own update" on public.kids_pin_comments;
create policy "kids_pin_comments own update" on public.kids_pin_comments for update using (auth.uid() = author_id);

create table if not exists public.kids_pin_occupations (
  pin_id bigint primary key references public.kids_pins(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  occupied_at timestamptz not null default now(),
  last_claimed_at timestamptz not null default now()
);
alter table public.kids_pin_occupations enable row level security;
drop policy if exists "kids_pin_occupations readable by all" on public.kids_pin_occupations;
create policy "kids_pin_occupations readable by all" on public.kids_pin_occupations for select using (true);

create table if not exists public.kids_pin_listings (
  pin_id bigint primary key references public.kids_pins(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  price numeric not null check (price > 0),
  listed_at timestamptz not null default now()
);
alter table public.kids_pin_listings enable row level security;
drop policy if exists "kids_pin_listings readable by all" on public.kids_pin_listings;
create policy "kids_pin_listings readable by all" on public.kids_pin_listings for select using (true);
drop policy if exists "kids_pin_listings seller write" on public.kids_pin_listings;
create policy "kids_pin_listings seller write" on public.kids_pin_listings for all using (auth.uid() = seller_id);

-- mlbg_award_log kind 확장
alter table public.mlbg_award_log drop constraint if exists mlbg_award_log_kind_check;
alter table public.mlbg_award_log
  add constraint mlbg_award_log_kind_check
  check (kind in (
    'apt_post','apt_comment',
    'community_post','community_comment',
    'hotdeal_post','hotdeal_comment',
    'factory_comment','emart_comment',
    'auction_comment','restaurant_comment',
    'kids_comment'
  ));

-- ──────────────────────────────────────────────
-- RPCs
-- ──────────────────────────────────────────────

create or replace function public.register_kids_pin(
  p_name text, p_description text, p_recommended_activity text,
  p_lat numeric, p_lng numeric, p_photo_url text default null,
  p_address text default null, p_dong text default null
)
returns table(out_success boolean, out_id bigint, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count int; v_id bigint; v_dup int;
begin
  if v_uid is null then return query select false, null::bigint, '로그인이 필요해요'::text; return; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then return query select false, null::bigint, '장소명을 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_description, ''))) = 0 then return query select false, null::bigint, '설명을 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_recommended_activity, ''))) = 0 then return query select false, null::bigint, '추천 액티비티를 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_photo_url, ''))) = 0 then return query select false, null::bigint, '사진은 필수입니다'::text; return; end if;
  if p_lat is null or p_lng is null then return query select false, null::bigint, '좌표가 필요해요'::text; return; end if;

  select count(*) into v_count from public.kids_pins where author_id = v_uid and deleted_at is null;
  if v_count >= 5 then
    return query select false, null::bigint, '1인당 최대 5개까지 등록 가능 (현재 ' || v_count || '개)'::text; return;
  end if;

  select count(*) into v_dup from public.kids_pins
    where author_id = v_uid and deleted_at is null
      and abs(lat - p_lat) < 0.0003 and abs(lng - p_lng) < 0.0003;
  if v_dup > 0 then
    return query select false, null::bigint, '같은 위치에 이미 등록한 장소가 있어요'::text; return;
  end if;

  insert into public.kids_pins (author_id, name, description, recommended_activity, lat, lng, photo_url, address, dong)
    values (v_uid, trim(p_name), trim(p_description), trim(p_recommended_activity), p_lat, p_lng,
            trim(p_photo_url),
            nullif(trim(coalesce(p_address, '')), ''),
            nullif(trim(coalesce(p_dong, '')), ''))
    returning id into v_id;

  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + 30 where id = v_uid;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.register_kids_pin(text, text, text, numeric, numeric, text, text, text) to authenticated;

create or replace function public.update_kids_pin(
  p_pin_id bigint, p_name text default null, p_description text default null,
  p_recommended_activity text default null, p_photo_url text default null
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pin record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select * into v_pin from public.kids_pins where id = p_pin_id and deleted_at is null;
  if v_pin.id is null then return query select false, '핀을 찾을 수 없어요'::text; return; end if;
  if v_pin.author_id <> v_uid then return query select false, '본인이 등록한 핀만 수정 가능해요'::text; return; end if;
  if p_name is not null and length(trim(p_name)) = 0 then return query select false, '장소명이 비어있어요'::text; return; end if;
  if p_description is not null and length(trim(p_description)) = 0 then return query select false, '설명이 비어있어요'::text; return; end if;
  if p_recommended_activity is not null and length(trim(p_recommended_activity)) = 0 then return query select false, '추천 액티비티가 비어있어요'::text; return; end if;
  if p_photo_url is not null and length(trim(p_photo_url)) = 0 then return query select false, '사진 URL 이 비어있어요'::text; return; end if;
  update public.kids_pins set
    name = coalesce(nullif(trim(p_name), ''), name),
    description = coalesce(nullif(trim(p_description), ''), description),
    recommended_activity = coalesce(nullif(trim(p_recommended_activity), ''), recommended_activity),
    photo_url = coalesce(nullif(trim(p_photo_url), ''), photo_url)
  where id = p_pin_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.update_kids_pin(bigint, text, text, text, text) to authenticated;

create or replace function public.delete_kids_pin(p_pin_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pin record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select * into v_pin from public.kids_pins where id = p_pin_id and deleted_at is null;
  if v_pin.id is null then return query select false, '핀을 찾을 수 없어요'::text; return; end if;
  if v_pin.author_id <> v_uid then return query select false, '본인 핀만 삭제 가능해요'::text; return; end if;
  update public.kids_pins set deleted_at = now() where id = p_pin_id;
  delete from public.kids_pin_occupations where pin_id = p_pin_id;
  delete from public.kids_pin_listings where pin_id = p_pin_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.delete_kids_pin(bigint) to authenticated;

create or replace function public.toggle_kids_pin_like(p_pin_id bigint)
returns table(out_liked boolean, out_count int, out_message text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_existing int; v_count int; v_author uuid;
begin
  if v_uid is null then return query select false, 0, '로그인이 필요해요'::text; return; end if;
  select author_id, like_count into v_author, v_count from public.kids_pins where id = p_pin_id and deleted_at is null;
  if v_author is null then return query select false, 0, '핀을 찾을 수 없어요'::text; return; end if;
  if v_author = v_uid then return query select false, coalesce(v_count, 0), '본인 핀엔 못 눌러요'::text; return; end if;

  select count(*) into v_existing from public.kids_pin_likes where pin_id = p_pin_id and user_id = v_uid;
  if v_existing > 0 then
    delete from public.kids_pin_likes where pin_id = p_pin_id and user_id = v_uid;
    update public.kids_pins set like_count = greatest(like_count - 1, 0) where id = p_pin_id returning like_count into v_count;
    update public.profiles set mlbg_balance = greatest(coalesce(mlbg_balance, 0) - 0.5, 0) where id = v_author;
    return query select false, coalesce(v_count, 0), null::text;
  else
    insert into public.kids_pin_likes (pin_id, user_id) values (p_pin_id, v_uid);
    update public.kids_pins set like_count = like_count + 1 where id = p_pin_id returning like_count into v_count;
    update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + 0.5 where id = v_author;
    return query select true, coalesce(v_count, 0), null::text;
  end if;
end;
$$;
grant execute on function public.toggle_kids_pin_like(bigint) to authenticated;

create or replace function public.occupy_kids_pin(p_pin_id bigint)
returns table(out_success boolean, out_message text, out_paid numeric)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pin record; v_balance numeric; v_taken int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_pin from public.kids_pins where id = p_pin_id and deleted_at is null;
  if v_pin.id is null then return query select false, '핀을 찾을 수 없어요'::text, 0::numeric; return; end if;
  select count(*) into v_taken from public.kids_pin_occupations where pin_id = p_pin_id;
  if v_taken > 0 then return query select false, '이미 다른 사람이 분양받음'::text, 0::numeric; return; end if;
  select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid for update;
  if v_balance < v_pin.occupy_price then
    return query select false, ('mlbg 부족 — 현재 ' || v_balance || ', 분양가 ' || v_pin.occupy_price)::text, 0::numeric; return;
  end if;
  update public.profiles set mlbg_balance = mlbg_balance - v_pin.occupy_price where id = v_uid;
  insert into public.kids_pin_occupations (pin_id, user_id) values (p_pin_id, v_uid);
  return query select true, null::text, v_pin.occupy_price;
end;
$$;
grant execute on function public.occupy_kids_pin(bigint) to authenticated;

create or replace function public.release_kids_pin(p_pin_id bigint)
returns table(out_success boolean, out_message text, out_refund numeric)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_occ record; v_pin record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_occ from public.kids_pin_occupations where pin_id = p_pin_id and user_id = v_uid;
  if v_occ.pin_id is null then return query select false, '본인 보유 핀이 아님'::text, 0::numeric; return; end if;
  select * into v_pin from public.kids_pins where id = p_pin_id;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_pin.occupy_price where id = v_uid;
  delete from public.kids_pin_occupations where pin_id = p_pin_id;
  delete from public.kids_pin_listings where pin_id = p_pin_id;
  return query select true, null::text, v_pin.occupy_price;
end;
$$;
grant execute on function public.release_kids_pin(bigint) to authenticated;

create or replace function public.claim_kids_pin_income(p_pin_id bigint)
returns table(out_success boolean, out_earned numeric, out_message text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_occ record; v_pin record;
  v_now timestamptz := now(); v_days int; v_earned numeric;
begin
  if v_uid is null then return query select false, 0::numeric, '로그인이 필요해요'::text; return; end if;
  select * into v_occ from public.kids_pin_occupations where pin_id = p_pin_id and user_id = v_uid for update;
  if v_occ.pin_id is null then return query select false, 0::numeric, '본인 보유 핀이 아님'::text; return; end if;
  select * into v_pin from public.kids_pins where id = p_pin_id;
  v_days := floor(extract(epoch from (v_now - coalesce(v_occ.last_claimed_at, v_occ.occupied_at))) / 86400)::int;
  if v_days < 1 then return query select false, 0::numeric, '아직 24시간 안 지남'::text; return; end if;
  v_earned := v_days * v_pin.daily_income;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_earned where id = v_uid;
  update public.kids_pin_occupations
    set last_claimed_at = coalesce(last_claimed_at, occupied_at) + (v_days || ' days')::interval
    where pin_id = p_pin_id;
  return query select true, v_earned, null::text;
end;
$$;
grant execute on function public.claim_kids_pin_income(bigint) to authenticated;

create or replace function public.list_kids_pin(p_pin_id bigint, p_price numeric)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_occ record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  if p_price is null or p_price <= 0 then return query select false, '가격이 잘못됐어요'::text; return; end if;
  select * into v_occ from public.kids_pin_occupations where pin_id = p_pin_id and user_id = v_uid;
  if v_occ.pin_id is null then return query select false, '본인 보유 핀이 아님'::text; return; end if;
  insert into public.kids_pin_listings (pin_id, seller_id, price)
    values (p_pin_id, v_uid, p_price)
    on conflict (pin_id) do update set price = excluded.price, listed_at = now();
  return query select true, null::text;
end;
$$;
grant execute on function public.list_kids_pin(bigint, numeric) to authenticated;

create or replace function public.unlist_kids_pin(p_pin_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  delete from public.kids_pin_listings where pin_id = p_pin_id and seller_id = v_uid;
  return query select true, null::text;
end;
$$;
grant execute on function public.unlist_kids_pin(bigint) to authenticated;

create or replace function public.buy_kids_pin(p_pin_id bigint)
returns table(out_success boolean, out_message text, out_price numeric)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_listing record; v_buyer_balance numeric;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric; return; end if;
  select * into v_listing from public.kids_pin_listings where pin_id = p_pin_id for update;
  if v_listing.pin_id is null then return query select false, '매도 등록되지 않은 핀'::text, 0::numeric; return; end if;
  if v_listing.seller_id = v_uid then return query select false, '본인 매물은 못 사요'::text, 0::numeric; return; end if;
  select coalesce(mlbg_balance, 0) into v_buyer_balance from public.profiles where id = v_uid for update;
  if v_buyer_balance < v_listing.price then
    return query select false, ('mlbg 부족 — 현재 ' || v_buyer_balance || ', 가격 ' || v_listing.price)::text, 0::numeric; return;
  end if;
  update public.profiles set mlbg_balance = mlbg_balance - v_listing.price where id = v_uid;
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_listing.price where id = v_listing.seller_id;
  update public.kids_pin_occupations set user_id = v_uid, occupied_at = now(), last_claimed_at = now() where pin_id = p_pin_id;
  delete from public.kids_pin_listings where pin_id = p_pin_id;
  return query select true, null::text, v_listing.price;
end;
$$;
grant execute on function public.buy_kids_pin(bigint) to authenticated;

create or replace function public.list_recent_kids_pins(p_limit int default 20)
returns table(
  id bigint, name text, description text, recommended_activity text,
  lat numeric, lng numeric, photo_url text, address text, dong text,
  occupy_price numeric, daily_income numeric, like_count int,
  author_id uuid, author_name text,
  occupier_id uuid, occupier_name text,
  listing_price numeric,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.description, r.recommended_activity,
    r.lat, r.lng, r.photo_url, r.address, r.dong,
    r.occupy_price, r.daily_income, r.like_count,
    r.author_id, ap.display_name,
    o.user_id, op.display_name,
    l.price, r.created_at
  from public.kids_pins r
  left join public.profiles ap on ap.id = r.author_id
  left join public.kids_pin_occupations o on o.pin_id = r.id
  left join public.profiles op on op.id = o.user_id
  left join public.kids_pin_listings l on l.pin_id = r.id
  where r.deleted_at is null
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.list_recent_kids_pins(int) to anon, authenticated;

-- 알림 트리거 — 댓글/좋아요
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'community_comment','apt_comment','apt_evicted','feedback_reply',
    'admin_notice','bio_comment',
    'offer_made','offer_accepted','snatch_made',
    'election_winner','election_loser',
    'restaurant_comment','restaurant_like',
    'kids_comment','kids_like'
  ));

create or replace function public.notify_kids_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_pin_name text; v_actor_name text;
begin
  select author_id, name into v_author, v_pin_name from public.kids_pins where id = new.pin_id;
  if v_author is null or v_author = new.author_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.author_id;
  insert into public.notifications(recipient_id, type, comment_id, comment_excerpt, actor_id, actor_name, listing_message)
  values (v_author, 'kids_comment', new.id, left(coalesce(new.content, ''), 80), new.author_id, v_actor_name, v_pin_name);
  return new;
end;
$$;
drop trigger if exists trg_notify_kids_comment on public.kids_pin_comments;
create trigger trg_notify_kids_comment after insert on public.kids_pin_comments for each row execute function public.notify_kids_comment();

create or replace function public.notify_kids_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_pin_name text; v_actor_name text;
begin
  select author_id, name into v_author, v_pin_name from public.kids_pins where id = new.pin_id;
  if v_author is null or v_author = new.user_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.user_id;
  insert into public.notifications(recipient_id, type, actor_id, actor_name, listing_message)
  values (v_author, 'kids_like', new.user_id, v_actor_name, v_pin_name);
  return new;
end;
$$;
drop trigger if exists trg_notify_kids_like on public.kids_pin_likes;
create trigger trg_notify_kids_like after insert on public.kids_pin_likes for each row execute function public.notify_kids_like();

notify pgrst, 'reload schema';
