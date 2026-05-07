-- ──────────────────────────────────────────────
-- 179: 스레드 전용 프로필 (사용자별 별명·bio·아바타·테마색)
-- 멜른버그 메인 닉네임과 별개. /threads 페이지에서 사용.
-- 없으면 메인 프로필로 fallback.
-- ──────────────────────────────────────────────

create table if not exists public.thread_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text,                      -- @핸들 (예: @melon — 표시용, unique 강제 안 함)
  display_name text,                -- 스레드 닉네임 (없으면 profiles.display_name fallback)
  bio text check (bio is null or length(bio) <= 300),
  avatar_url text,                  -- 스레드 전용 아바타
  theme_color text check (theme_color is null or theme_color ~ '^#[0-9A-Fa-f]{6}$'),  -- HEX
  updated_at timestamptz not null default now()
);

alter table public.thread_profiles enable row level security;
drop policy if exists "thread_profiles readable by all" on public.thread_profiles;
create policy "thread_profiles readable by all" on public.thread_profiles for select using (true);
drop policy if exists "thread_profiles own upsert" on public.thread_profiles;
create policy "thread_profiles own upsert" on public.thread_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
