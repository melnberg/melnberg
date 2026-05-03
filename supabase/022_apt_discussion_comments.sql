-- ──────────────────────────────────────────────
-- 022: 아파트 토론방 댓글 테이블
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

create table if not exists public.apt_discussion_comments (
  id bigserial primary key,
  discussion_id bigint not null references public.apt_discussions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apt_discussion_comments_discussion_idx
  on public.apt_discussion_comments (discussion_id, created_at)
  where deleted_at is null;
create index if not exists apt_discussion_comments_author_idx
  on public.apt_discussion_comments (author_id, created_at desc)
  where deleted_at is null;

-- updated_at 자동 갱신
create or replace function public.touch_apt_discussion_comments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists apt_discussion_comments_touch on public.apt_discussion_comments;
create trigger apt_discussion_comments_touch
  before update on public.apt_discussion_comments
  for each row execute function public.touch_apt_discussion_comments_updated_at();

-- RLS: 누구나 읽기, 본인만 쓰기 (어드민은 모두 가능)
alter table public.apt_discussion_comments enable row level security;

drop policy if exists "Anyone can read comments" on public.apt_discussion_comments;
create policy "Anyone can read comments"
  on public.apt_discussion_comments for select using (deleted_at is null);

drop policy if exists "Auth users can write own comments" on public.apt_discussion_comments;
create policy "Auth users can write own comments"
  on public.apt_discussion_comments for insert
  with check (auth.uid() = author_id);

drop policy if exists "Authors can update own comments" on public.apt_discussion_comments;
create policy "Authors can update own comments"
  on public.apt_discussion_comments for update
  using (auth.uid() = author_id or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (auth.uid() = author_id or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Authors can delete own comments" on public.apt_discussion_comments;
create policy "Authors can delete own comments"
  on public.apt_discussion_comments for delete
  using (auth.uid() = author_id or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

comment on table public.apt_discussion_comments is '아파트 토론방 댓글. 평면 (대댓글 없음).';
