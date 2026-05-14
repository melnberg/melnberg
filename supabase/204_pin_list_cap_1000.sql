-- ──────────────────────────────────────────────
-- 204: 맛집/육아 list RPC 의 내부 cap 100 → 1000 으로 상향
-- 알이브 핀이 100개 넘어가면서 오래된 핀이 안 보이고, 상세 페이지도 404 가능.
-- ──────────────────────────────────────────────

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
  limit greatest(1, least(coalesce(p_limit, 20), 1000));
$$;
grant execute on function public.list_recent_restaurant_pins(int) to anon, authenticated;

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
  limit greatest(1, least(coalesce(p_limit, 20), 1000));
$$;
grant execute on function public.list_recent_kids_pins(int) to anon, authenticated;

notify pgrst, 'reload schema';
