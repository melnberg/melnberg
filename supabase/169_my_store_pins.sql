-- ──────────────────────────────────────────────
-- 169: 내 가게 (my_stores) 메인 지도 핀 노출용 RPC
-- list_recent_restaurant_pins / list_recent_kids_pins 패턴 그대로.
-- 분양/매도/점거 컬럼 없음 (개인 사업장이라 거래 X).
-- 별표 핀 + verified 배지 클라이언트 렌더용 데이터 제공.
-- ──────────────────────────────────────────────

drop function if exists public.list_recent_my_store_pins(int);

create or replace function public.list_recent_my_store_pins(p_limit int default 100)
returns table(
  id bigint,
  name text,
  category text,
  description text,
  recommended text,
  lat numeric,
  lng numeric,
  photo_url text,
  address text,
  dong text,
  contact text,
  url text,
  verified boolean,
  like_count int,
  author_id uuid,
  author_name text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    s.id, s.name, s.category, s.description, s.recommended,
    s.lat, s.lng, s.photo_url, s.address, s.dong,
    s.contact, s.url, s.verified, s.like_count,
    s.author_id, ap.display_name,
    s.created_at
  from public.my_stores s
  left join public.profiles ap on ap.id = s.author_id
  where s.deleted_at is null
    and s.lat is not null
    and s.lng is not null
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

grant execute on function public.list_recent_my_store_pins(int) to anon, authenticated;

notify pgrst, 'reload schema';
