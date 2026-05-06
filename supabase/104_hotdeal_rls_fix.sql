-- ──────────────────────────────────────────────
-- 104: hotdeal 카테고리 RLS 누락 핫픽스
-- 002 의 posts insert/update/delete 정책이 'community' 또는 admin 'blog' 만 허용.
-- 066 에서 hotdeal 카테고리 추가했지만 RLS 정책 갱신 안 됐음 → 핫딜 글 작성 시
-- "new row violates row-level security policy for table posts" 에러.
-- hotdeal 도 인증된 본인이면 작성·수정·삭제 가능하게 추가.
-- ──────────────────────────────────────────────

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
