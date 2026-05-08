-- ──────────────────────────────────────────────
-- 191: 포춘쿠키 — 일일 1회 운세 뽑기
-- 사이드바 버튼 누르면 운세 1건 뽑음. 같은 날 같은 사용자는 한 번만 가능.
-- 피드에 본인 이름 + 운세 내용 노출. 클릭하면 댓글 가능.
-- ──────────────────────────────────────────────

create table if not exists public.fortune_cookies (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  fortune_text text not null,
  drawn_date date not null default (now() at time zone 'Asia/Seoul')::date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, drawn_date)
);

create index if not exists fortune_cookies_recent_idx
  on public.fortune_cookies(created_at desc)
  where deleted_at is null;

alter table public.fortune_cookies enable row level security;

drop policy if exists "fortune_cookies read all" on public.fortune_cookies;
create policy "fortune_cookies read all" on public.fortune_cookies
  for select using (deleted_at is null);

drop policy if exists "fortune_cookies own insert" on public.fortune_cookies;
create policy "fortune_cookies own insert" on public.fortune_cookies
  for insert with check (auth.uid() = user_id);

drop policy if exists "fortune_cookies own delete" on public.fortune_cookies;
create policy "fortune_cookies own delete" on public.fortune_cookies
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 댓글 — 별도 테이블 (기존 comments 의 post_id FK 충돌 회피)
create table if not exists public.fortune_comments (
  id bigserial primary key,
  fortune_id bigint not null references public.fortune_cookies(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists fortune_comments_fortune_idx
  on public.fortune_comments(fortune_id, created_at)
  where deleted_at is null;

alter table public.fortune_comments enable row level security;

drop policy if exists "fortune_comments read all" on public.fortune_comments;
create policy "fortune_comments read all" on public.fortune_comments
  for select using (deleted_at is null);

drop policy if exists "fortune_comments own insert" on public.fortune_comments;
create policy "fortune_comments own insert" on public.fortune_comments
  for insert with check (auth.uid() = author_id);

drop policy if exists "fortune_comments own delete" on public.fortune_comments;
create policy "fortune_comments own delete" on public.fortune_comments
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

notify pgrst, 'reload schema';
