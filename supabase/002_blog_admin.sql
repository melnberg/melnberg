-- ──────────────────────────────────────────────
-- 002: 블로그 카테고리 + 관리자 권한
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- 1. profiles에 admin 컬럼 추가
alter table public.profiles
  add column if not exists is_admin boolean default false not null;

-- 2. posts에 category 컬럼 추가 (community / blog)
alter table public.posts
  add column if not exists category text default 'community' not null;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'posts' and constraint_name = 'posts_category_check'
  ) then
    alter table public.posts
      add constraint posts_category_check check (category in ('community', 'blog'));
  end if;
end $$;

create index if not exists posts_category_created_at_idx on public.posts (category, created_at desc);

-- 3. 본인을 admin으로 설정
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'imeunjong@gmail.com');

-- 4. RLS 정책 갱신 — blog 카테고리는 admin만 작성·수정·삭제
drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert with check (
    auth.uid() = author_id
    and (
      category = 'community'
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
      or (category = 'blog' and exists (
        select 1 from public.profiles where id = auth.uid() and is_admin = true
      ))
    )
  );
