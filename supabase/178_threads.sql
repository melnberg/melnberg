-- ──────────────────────────────────────────────
-- 178: 각자의 스레드 (Threads 스타일 SNS)
--   threads: 짧은 글 (제목 없음, 본문만)
--   thread_likes: 좋아요 (user × thread, PK 둘)
--   parent_id 로 답글 트리
--
-- 보상은 추후. 일단 등록·읽기·좋아요만.
-- ──────────────────────────────────────────────

create table if not exists public.threads (
  id bigserial primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id bigint references public.threads(id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 1000),
  like_count int not null default 0,
  reply_count int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists threads_author_idx on public.threads(author_id, created_at desc) where deleted_at is null;
create index if not exists threads_parent_idx on public.threads(parent_id, created_at) where deleted_at is null;
create index if not exists threads_recent_idx on public.threads(created_at desc) where deleted_at is null;

alter table public.threads enable row level security;
drop policy if exists "threads readable by all" on public.threads;
create policy "threads readable by all" on public.threads for select using (deleted_at is null);
drop policy if exists "threads own insert" on public.threads;
create policy "threads own insert" on public.threads for insert with check (auth.uid() = author_id);
drop policy if exists "threads own update" on public.threads;
create policy "threads own update" on public.threads for update using (auth.uid() = author_id);

create table if not exists public.thread_likes (
  thread_id bigint not null references public.threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists thread_likes_thread_idx on public.thread_likes(thread_id);
alter table public.thread_likes enable row level security;
drop policy if exists "thread_likes readable by all" on public.thread_likes;
create policy "thread_likes readable by all" on public.thread_likes for select using (true);
drop policy if exists "thread_likes own insert" on public.thread_likes;
create policy "thread_likes own insert" on public.thread_likes for insert with check (auth.uid() = user_id);
drop policy if exists "thread_likes own delete" on public.thread_likes;
create policy "thread_likes own delete" on public.thread_likes for delete using (auth.uid() = user_id);

-- 좋아요 토글 RPC — like_count 동기 갱신
create or replace function public.toggle_thread_like(p_thread_id bigint)
returns table(out_liked boolean, out_count int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
  v_count int;
begin
  if v_uid is null then return query select false, 0; return; end if;
  select count(*) into v_existing from public.thread_likes where thread_id = p_thread_id and user_id = v_uid;
  if v_existing > 0 then
    delete from public.thread_likes where thread_id = p_thread_id and user_id = v_uid;
    update public.threads set like_count = greatest(like_count - 1, 0) where id = p_thread_id
      returning like_count into v_count;
    return query select false, coalesce(v_count, 0);
  else
    insert into public.thread_likes (thread_id, user_id) values (p_thread_id, v_uid);
    update public.threads set like_count = like_count + 1 where id = p_thread_id
      returning like_count into v_count;
    return query select true, coalesce(v_count, 0);
  end if;
end;
$$;
grant execute on function public.toggle_thread_like(bigint) to authenticated;

-- 답글 등록 시 부모의 reply_count 자동 증가 (트리거)
create or replace function public.threads_after_insert_reply()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    update public.threads set reply_count = reply_count + 1 where id = new.parent_id;
  end if;
  return new;
end;
$$;
drop trigger if exists threads_after_insert_reply_trg on public.threads;
create trigger threads_after_insert_reply_trg
  after insert on public.threads
  for each row execute function public.threads_after_insert_reply();

notify pgrst, 'reload schema';
