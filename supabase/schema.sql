-- ──────────────────────────────────────────────
-- 멜른버그 커뮤니티 스키마
-- 실행 위치: Supabase Dashboard → SQL Editor → New query
-- ──────────────────────────────────────────────

-- 1. profiles 테이블 (auth.users 확장)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamp with time zone default now() not null
);

-- 사용자 가입 시 profiles 자동 생성 트리거
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 기존 사용자 프로필 백필 (이미 가입한 사람)
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- 2. posts 테이블
create table if not exists public.posts (
  id bigserial primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);

-- 3. comments 테이블
create table if not exists public.comments (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone default now() not null
);

create index if not exists comments_post_id_idx on public.comments (post_id, created_at);

-- 4. RLS 활성화
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;

-- 5. 정책: profiles
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- 6. 정책: posts
drop policy if exists "Posts are viewable by everyone" on public.posts;
create policy "Posts are viewable by everyone"
  on public.posts for select using (true);

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert with check (auth.uid() = author_id);

drop policy if exists "Authors can update own posts" on public.posts;
create policy "Authors can update own posts"
  on public.posts for update using (auth.uid() = author_id);

drop policy if exists "Authors can delete own posts" on public.posts;
create policy "Authors can delete own posts"
  on public.posts for delete using (auth.uid() = author_id);

-- 7. 정책: comments
drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone"
  on public.comments for select using (true);

drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can create comments"
  on public.comments for insert with check (auth.uid() = author_id);

drop policy if exists "Authors can delete own comments" on public.comments;
create policy "Authors can delete own comments"
  on public.comments for delete using (auth.uid() = author_id);
