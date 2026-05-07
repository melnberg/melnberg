-- ──────────────────────────────────────────────
-- 166: stocks 카테고리 RLS 핫픽스 (104 패턴 반복)
-- 161 에서 'stocks' 카테고리 추가했으나 104 의 INSERT/UPDATE/DELETE 정책이
-- community/hotdeal/blog 만 허용 → stocks 글 작성 시 RLS 차단.
-- "new row violates row-level security policy for table posts" 사고.
--
-- 동일 패턴: stocks 도 누구나 작성 가능 (community 와 동일).
-- check 제약 보강도 같이 (161 미적용 환경 대비).
-- ──────────────────────────────────────────────

-- check 제약 — 이미 161 에서 추가됐겠지만 안전망
alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts
  add constraint posts_category_check
  check (category in ('community', 'blog', 'hotdeal', 'stocks'));

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert with check (
    auth.uid() = author_id
    and (
      category = 'community'
      or category = 'hotdeal'
      or category = 'stocks'
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
      or category = 'stocks'
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
      or category = 'stocks'
      or (category = 'blog' and exists (
        select 1 from public.profiles where id = auth.uid() and is_admin = true
      ))
    )
  );

notify pgrst, 'reload schema';
