-- ──────────────────────────────────────────────
-- 173: 사이드바 빨간점 — 5개 게시판의 최신 created_at 을 단일 RPC 로 반환.
--
-- 변경 전: Layout.tsx 가 supabase 5번 round-trip
--   posts×3 (community/realty/stocks) + restaurant_pins + kids_pins
-- 변경 후: 단일 RPC 호출 → SSR latency 감소.
--
-- 안전: 단순 max(created_at) 5개. 사용 테이블에 deleted_at, created_at 인덱스 이미 존재.
-- ──────────────────────────────────────────────

drop function if exists public.get_board_latest_posts();
create or replace function public.get_board_latest_posts()
returns table(
  community timestamptz,
  realty    timestamptz,
  stocks    timestamptz,
  restaurants timestamptz,
  kids      timestamptz
)
language sql stable security invoker as $$
  select
    (select max(created_at) from public.posts            where category = 'community' and deleted_at is null) as community,
    (select max(created_at) from public.posts            where category = 'realty'    and deleted_at is null) as realty,
    (select max(created_at) from public.posts            where category = 'stocks'    and deleted_at is null) as stocks,
    (select max(created_at) from public.restaurant_pins  where deleted_at is null)                            as restaurants,
    (select max(created_at) from public.kids_pins        where deleted_at is null)                            as kids;
$$;

-- anon / authenticated 둘 다 호출 가능 (사이드바는 비로그인도 봄).
grant execute on function public.get_board_latest_posts() to anon, authenticated;
