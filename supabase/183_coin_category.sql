-- ──────────────────────────────────────────────
-- 183: 코인 토론 카테고리 추가
-- - posts.category check 에 'coin' 추가
-- - INSERT RLS 에 coin 허용
-- - get_board_latest_posts() 에 coin 컬럼 포함 (173 갱신)
-- ──────────────────────────────────────────────

alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts
  add constraint posts_category_check
  check (category in ('community', 'blog', 'hotdeal', 'stocks', 'realty', 'worry', 'coin'));

create index if not exists posts_coin_idx
  on public.posts(created_at desc)
  where category = 'coin';

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert with check (
    auth.uid() = author_id
    and (
      category = 'community' or category = 'hotdeal' or category = 'stocks'
      or category = 'realty' or category = 'worry' or category = 'coin'
      or (category = 'blog' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
    )
  );

-- 사이드바 빨간점 RPC — coin 컬럼 포함 (173 의 5개 → 6개)
drop function if exists public.get_board_latest_posts();
create or replace function public.get_board_latest_posts()
returns table(
  community   timestamptz,
  realty      timestamptz,
  stocks      timestamptz,
  coin        timestamptz,
  restaurants timestamptz,
  kids        timestamptz
)
language sql stable security invoker as $$
  select
    (select max(created_at) from public.posts            where category = 'community' and deleted_at is null) as community,
    (select max(created_at) from public.posts            where category = 'realty'    and deleted_at is null) as realty,
    (select max(created_at) from public.posts            where category = 'stocks'    and deleted_at is null) as stocks,
    (select max(created_at) from public.posts            where category = 'coin'      and deleted_at is null) as coin,
    (select max(created_at) from public.restaurant_pins  where deleted_at is null)                            as restaurants,
    (select max(created_at) from public.kids_pins        where deleted_at is null)                            as kids;
$$;

grant execute on function public.get_board_latest_posts() to anon, authenticated;

notify pgrst, 'reload schema';
