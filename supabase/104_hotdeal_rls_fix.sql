-- ──────────────────────────────────────────────
-- 104: hotdeal 카테고리 RLS 누락 핫픽스 + check 제약 보강
-- 002 의 posts insert/update/delete 정책이 'community' 또는 admin 'blog' 만 허용.
-- 066 에서 hotdeal 카테고리 추가했지만 RLS 정책 갱신 안 됐음 → 핫딜 글 작성 시
-- "new row violates row-level security policy for table posts" 에러.
-- 또한 일부 환경에서 SQL 066 자체가 미적용이라 check constraint 도 hotdeal 미포함
-- ("violates check constraint posts_category_check"). 두 문제 모두 해결.
-- ──────────────────────────────────────────────

-- 0) check 제약 보강 (066 미적용 환경 안전망)
alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts
  add constraint posts_category_check
  check (category in ('community', 'blog', 'hotdeal'));

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert with check (
    auth.uid() = author_id
    and (
      category = 'community'
      or category = 'hotdeal'
      or (category = 'blog' and exists (
        select 1 from public.profiles where id = auth.uid() and is_admin = true
      ))
    )
  );

drop policy if exists "Authors can update own posts" on public.posts;
create policy "Authors can update own posts"
  on public.posts for update using (
    auth.uid() = author_id
    and (
      category = 'community'
      or category = 'hotdeal'
      or (category = 'blog' and exists (
        select 1 from public.profiles where id = auth.uid() and is_admin = true
      ))
    )
  );

drop policy if exists "Authors can delete own posts" on public.posts;
create policy "Authors can delete own posts"
  on public.posts for delete using (
    auth.uid() = author_id
    and (
      category = 'community'
      or category = 'hotdeal'
      or (category = 'blog' and exists (
        select 1 from public.profiles where id = auth.uid() and is_admin = true
      ))
    )
  );

notify pgrst, 'reload schema';
