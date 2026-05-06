-- ──────────────────────────────────────────────
-- 145: restaurant_pins 행정동 컬럼 추가 + 맛집 등록 가능 1회성 공지/알림
-- 1) restaurant_pins.dong 컬럼 추가 ('ㅇㅇ동' 형식)
-- 2) register_restaurant_pin RPC 에 p_dong 파라미터 추가
-- 3) list_recent_restaurant_pins 에 dong 포함
-- 4) 사이트 공지 1건 + 모든 사용자에게 admin_notice 알림 1회성 발송
-- ──────────────────────────────────────────────

alter table public.restaurant_pins
  add column if not exists dong text;

-- register_restaurant_pin 재정의 — p_dong 추가
create or replace function public.register_restaurant_pin(
  p_name text, p_description text, p_recommended_menu text,
  p_lat numeric, p_lng numeric, p_photo_url text default null,
  p_address text default null, p_dong text default null
)
returns table(out_success boolean, out_id bigint, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_id bigint;
  v_dup int;
begin
  if v_uid is null then return query select false, null::bigint, '로그인이 필요해요'::text; return; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then return query select false, null::bigint, '가게명을 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_description, ''))) = 0 then return query select false, null::bigint, '설명을 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_recommended_menu, ''))) = 0 then return query select false, null::bigint, '추천메뉴를 입력하세요'::text; return; end if;
  if p_lat is null or p_lng is null then return query select false, null::bigint, '좌표가 필요해요'::text; return; end if;

  select count(*) into v_count from public.restaurant_pins
    where author_id = v_uid and deleted_at is null;
  if v_count >= 5 then
    return query select false, null::bigint, '1인당 최대 5개까지 등록 가능 (현재 ' || v_count || '개)'::text; return;
  end if;

  select count(*) into v_dup from public.restaurant_pins
    where author_id = v_uid and deleted_at is null
      and abs(lat - p_lat) < 0.0003 and abs(lng - p_lng) < 0.0003;
  if v_dup > 0 then
    return query select false, null::bigint, '같은 위치에 이미 등록한 가게가 있어요'::text; return;
  end if;

  insert into public.restaurant_pins (author_id, name, description, recommended_menu, lat, lng, photo_url, address, dong)
    values (v_uid, trim(p_name), trim(p_description), trim(p_recommended_menu), p_lat, p_lng,
            nullif(trim(coalesce(p_photo_url, '')), ''), nullif(trim(coalesce(p_address, '')), ''),
            nullif(trim(coalesce(p_dong, '')), ''))
    returning id into v_id;

  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + 30 where id = v_uid;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.register_restaurant_pin(text, text, text, numeric, numeric, text, text, text) to authenticated;

-- list_recent_restaurant_pins 재정의 — dong 포함
create or replace function public.list_recent_restaurant_pins(p_limit int default 20)
returns table(
  id bigint, name text, description text, recommended_menu text,
  lat numeric, lng numeric, photo_url text, address text, dong text,
  occupy_price numeric, daily_income numeric, like_count int,
  author_id uuid, author_name text,
  occupier_id uuid, occupier_name text,
  listing_price numeric,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.name, r.description, r.recommended_menu,
    r.lat, r.lng, r.photo_url, r.address, r.dong,
    r.occupy_price, r.daily_income, r.like_count,
    r.author_id, ap.display_name,
    o.user_id, op.display_name,
    l.price,
    r.created_at
  from public.restaurant_pins r
  left join public.profiles ap on ap.id = r.author_id
  left join public.restaurant_pin_occupations o on o.pin_id = r.id
  left join public.profiles op on op.id = o.user_id
  left join public.restaurant_pin_listings l on l.pin_id = r.id
  where r.deleted_at is null
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.list_recent_restaurant_pins(int) to anon, authenticated;

-- 사이트 공지 (피드 노출용)
insert into public.site_announcements(title, body, link_url, created_by)
values (
  '🍴 맛집 추천 기능 오픈',
  E'본인이 아는 맛집을 직접 등록할 수 있어요.\n\n' ||
  E'· 등록 시 +30 mlbg 즉시 지급\n' ||
  E'· 1인 최대 5개\n' ||
  E'· 가게명 / 설명 / 추천메뉴 + 사진 (선택)\n' ||
  E'· 누구나 분양받기 가능 (100 mlbg, 일 수익 1)\n' ||
  E'· 좋아요 / 댓글 시 등록자에게 종 알림\n\n' ||
  E'좌측 사이드바 "🍴 맛집 추천" → "+ 맛집 등록".',
  '/restaurants/new',
  coalesce(
    (select created_by from public.site_announcements where created_by is not null order by created_at desc limit 1),
    (select id from auth.users order by created_at asc limit 1)
  )
);

-- 모든 사용자에게 admin_notice 알림 1회성 (종 빨간 점)
insert into public.notifications (recipient_id, type, actor_name, comment_excerpt)
  select id, 'admin_notice', '멜른버그 운영',
    '🍴 맛집 추천 기능 오픈! 본인이 아는 맛집 등록 시 +30 mlbg. 좌측 사이드바 → 맛집 추천.'
  from public.profiles;

notify pgrst, 'reload schema';
