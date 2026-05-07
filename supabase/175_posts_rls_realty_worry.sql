-- ──────────────────────────────────────────────
-- 175: posts INSERT RLS 에 realty / worry 카테고리 허용
-- 166_stocks_rls_fix.sql 의 정책에 realty, worry 가 빠져있어 INSERT 가 차단됨.
-- ──────────────────────────────────────────────

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert with check (
    auth.uid() = author_id
    and (
      category = 'community'
      or category = 'hotdeal'
      or category = 'stocks'
      or category = 'realty'
      or category = 'worry'
      or (category = 'blog' and exists (
        select 1 from public.profiles where id = auth.uid() and is_admin = true
      ))
    )
  );

notify pgrst, 'reload schema';
