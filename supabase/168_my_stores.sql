-- ──────────────────────────────────────────────
-- 168: 내 가게 — 사용자가 직접 운영하는 실제 사업장 (1인 1개)
-- 맛집 핀 (restaurant_pins) 구조 그대로 베끼되:
--   - 1인 1개 (author_id UNIQUE)
--   - 분양/매도 메커니즘 X (개인 사업장이므로 거래 불가)
--   - 사업자번호 검증은 API 라우트에서 수행 (DB 저장 X)
--   - verified 컬럼으로 검증 결과만 boolean 저장
-- ──────────────────────────────────────────────

-- 본 테이블
create table if not exists public.my_stores (
  id bigserial primary key,
  author_id uuid not null unique references auth.users(id) on delete cascade,  -- 1인 1개
  name text not null check (length(trim(name)) > 0 and length(name) <= 40),
  category text check (length(category) <= 30),                                 -- 카페/미용실/헬스장 등 자유
  description text not null check (length(trim(description)) > 0 and length(description) <= 500),
  recommended text check (length(recommended) <= 200),                          -- 메인 메뉴/서비스
  lat numeric not null,
  lng numeric not null,
  photo_url text,
  address text,
  dong text,
  contact text,                                                                 -- 전화/오픈채팅 등
  url text,                                                                     -- 인스타·홈페이지
  verified boolean not null default false,                                      -- NTS 검증 통과 여부
  verified_at timestamptz,
  like_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists my_stores_recent_idx on public.my_stores(created_at desc) where deleted_at is null;
create index if not exists my_stores_geo_idx on public.my_stores(lat, lng) where deleted_at is null;

alter table public.my_stores enable row level security;
drop policy if exists "my_stores readable by all" on public.my_stores;
create policy "my_stores readable by all" on public.my_stores for select using (deleted_at is null);
-- INSERT 는 RPC 통과만 (검증 + 1인1개 강제)
drop policy if exists "my_stores author update" on public.my_stores;
create policy "my_stores author update"
  on public.my_stores for update using (auth.uid() = author_id);

-- 좋아요
create table if not exists public.my_store_likes (
  store_id bigint not null references public.my_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index if not exists my_store_likes_store_idx on public.my_store_likes(store_id);
alter table public.my_store_likes enable row level security;
drop policy if exists "my_store_likes readable by all" on public.my_store_likes;
create policy "my_store_likes readable by all" on public.my_store_likes for select using (true);

-- 댓글
create table if not exists public.my_store_comments (
  id bigserial primary key,
  store_id bigint not null references public.my_stores(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists my_store_comments_store_idx on public.my_store_comments(store_id, created_at) where deleted_at is null;
alter table public.my_store_comments enable row level security;
drop policy if exists "my_store_comments readable by all" on public.my_store_comments;
create policy "my_store_comments readable by all" on public.my_store_comments for select using (deleted_at is null);
drop policy if exists "my_store_comments own insert" on public.my_store_comments;
create policy "my_store_comments own insert"
  on public.my_store_comments for insert with check (auth.uid() = author_id);
drop policy if exists "my_store_comments own update" on public.my_store_comments;
create policy "my_store_comments own update"
  on public.my_store_comments for update using (auth.uid() = author_id);

-- mlbg_award_log 에 store_comment 추가
alter table public.mlbg_award_log drop constraint if exists mlbg_award_log_kind_check;
alter table public.mlbg_award_log
  add constraint mlbg_award_log_kind_check
  check (kind in (
    'apt_post','apt_comment',
    'community_post','community_comment',
    'hotdeal_post','hotdeal_comment',
    'factory_comment','emart_comment',
    'auction_comment','restaurant_comment',
    'kids_comment','store_comment'
  ));

-- 알림 타입에 store 추가
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'community_comment','apt_comment','apt_evicted','feedback_reply',
    'admin_notice','bio_comment',
    'offer_made','offer_accepted','snatch_made',
    'election_winner','election_loser',
    'restaurant_comment','restaurant_like',
    'kids_comment','kids_like',
    'facility_income_auto',
    'store_comment','store_like'
  ));

-- ──────────────────────────────────────────────
-- RPCs
-- ──────────────────────────────────────────────

-- 1) 가게 등록 — 1인 1개. 등록 보상 +30 mlbg.
-- 사업자번호 검증은 API 라우트에서 통과 후 호출. 호출자가 verified=true 로 INSERT 가능하게 트러스트.
-- 내부적으로 author_id UNIQUE 가 1인 1개 강제.
drop function if exists public.register_my_store(text, text, text, text, numeric, numeric, text, text, text, text, text, boolean);
create or replace function public.register_my_store(
  p_name text, p_category text, p_description text, p_recommended text,
  p_lat numeric, p_lng numeric,
  p_photo_url text default null, p_address text default null, p_dong text default null,
  p_contact text default null, p_url text default null,
  p_verified boolean default false
)
returns table(out_success boolean, out_id bigint, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
  v_id bigint;
begin
  if v_uid is null then return query select false, null::bigint, '로그인이 필요해요'::text; return; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then return query select false, null::bigint, '가게명을 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_description, ''))) = 0 then return query select false, null::bigint, '설명을 입력하세요'::text; return; end if;
  if p_lat is null or p_lng is null then return query select false, null::bigint, '좌표가 필요해요'::text; return; end if;

  select count(*) into v_existing from public.my_stores
    where author_id = v_uid and deleted_at is null;
  if v_existing > 0 then
    return query select false, null::bigint, '이미 등록한 가게가 있어요 (1인 1개)'::text; return;
  end if;

  insert into public.my_stores (
    author_id, name, category, description, recommended,
    lat, lng, photo_url, address, dong, contact, url,
    verified, verified_at
  )
  values (
    v_uid, trim(p_name),
    nullif(trim(coalesce(p_category, '')), ''),
    trim(p_description),
    nullif(trim(coalesce(p_recommended, '')), ''),
    p_lat, p_lng,
    nullif(trim(coalesce(p_photo_url, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_dong, '')), ''),
    nullif(trim(coalesce(p_contact, '')), ''),
    nullif(trim(coalesce(p_url, '')), ''),
    coalesce(p_verified, false),
    case when coalesce(p_verified, false) then now() else null end
  )
  returning id into v_id;

  -- 등록 보상 +30 mlbg
  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + 30 where id = v_uid;

  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.register_my_store(text, text, text, text, numeric, numeric, text, text, text, text, text, boolean) to authenticated;

-- 2) 좋아요 토글 (맛집 패턴)
create or replace function public.toggle_my_store_like(p_store_id bigint)
returns table(out_liked boolean, out_count int, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
  v_count int;
  v_author uuid;
begin
  if v_uid is null then return query select false, 0, '로그인이 필요해요'::text; return; end if;
  select author_id, like_count into v_author, v_count from public.my_stores
    where id = p_store_id and deleted_at is null;
  if v_author is null then return query select false, 0, '가게를 찾을 수 없어요'::text; return; end if;
  if v_author = v_uid then return query select false, coalesce(v_count, 0), '본인 가게엔 못 눌러요'::text; return; end if;

  select count(*) into v_existing from public.my_store_likes
    where store_id = p_store_id and user_id = v_uid;
  if v_existing > 0 then
    delete from public.my_store_likes where store_id = p_store_id and user_id = v_uid;
    update public.my_stores set like_count = greatest(like_count - 1, 0) where id = p_store_id
      returning like_count into v_count;
    update public.profiles set mlbg_balance = greatest(coalesce(mlbg_balance, 0) - 0.5, 0) where id = v_author;
    return query select false, coalesce(v_count, 0), null::text;
  else
    insert into public.my_store_likes (store_id, user_id) values (p_store_id, v_uid);
    update public.my_stores set like_count = like_count + 1 where id = p_store_id
      returning like_count into v_count;
    update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + 0.5 where id = v_author;
    return query select true, coalesce(v_count, 0), null::text;
  end if;
end;
$$;
grant execute on function public.toggle_my_store_like(bigint) to authenticated;

comment on table public.my_stores is '사용자 1인 1개 실제 사업장. NTS 사업자등록정보 진위확인 후 verified=true.';

notify pgrst, 'reload schema';
