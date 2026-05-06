-- ──────────────────────────────────────────────
-- 107: 글 좋아요 (하트)
-- post_likes 조인 테이블 + posts.like_count denormalized 컬럼.
-- 토글 RPC — 본인이 누른 적 있으면 unlike, 없으면 like.
-- ──────────────────────────────────────────────

-- 1) 좋아요 테이블
create table if not exists public.post_likes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_post_idx on public.post_likes(post_id);
create index if not exists post_likes_user_idx on public.post_likes(user_id);

alter table public.post_likes enable row level security;

drop policy if exists "post_likes readable by all" on public.post_likes;
create policy "post_likes readable by all"
  on public.post_likes for select using (true);

-- write 는 RPC 통과만 — 정책은 본인 행만 (RPC security definer 라 우회 가능)
drop policy if exists "post_likes own write" on public.post_likes;
create policy "post_likes own write"
  on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "post_likes own delete" on public.post_likes;
create policy "post_likes own delete"
  on public.post_likes for delete using (auth.uid() = user_id);

-- 2) posts.like_count 컬럼 — denormalized for fast list display
alter table public.posts
  add column if not exists like_count int not null default 0;

-- 3) 토글 RPC — 본인이 누른 적 있으면 해제 + count -1, 없으면 like + count +1.
create or replace function public.toggle_post_like(p_post_id bigint)
returns table(out_liked boolean, out_count int, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
  v_count int;
begin
  if v_uid is null then
    return query select false, 0, '로그인이 필요해요'::text; return;
  end if;

  -- 글 존재 + 미삭제 검증
  select like_count into v_count from public.posts where id = p_post_id and deleted_at is null;
  if v_count is null then
    return query select false, 0, '글을 찾을 수 없어요'::text; return;
  end if;

  select count(*) into v_existing from public.post_likes
    where post_id = p_post_id and user_id = v_uid;

  if v_existing > 0 then
    delete from public.post_likes where post_id = p_post_id and user_id = v_uid;
    update public.posts set like_count = greatest(like_count - 1, 0) where id = p_post_id
      returning like_count into v_count;
    return query select false, coalesce(v_count, 0), null::text;
  else
    insert into public.post_likes (post_id, user_id) values (p_post_id, v_uid);
    update public.posts set like_count = like_count + 1 where id = p_post_id
      returning like_count into v_count;
    return query select true, coalesce(v_count, 0), null::text;
  end if;
end;
$$;
grant execute on function public.toggle_post_like(bigint) to authenticated;

-- 4) 백필 — 기존 like_count = 실제 post_likes count (안전망, 첫 적용 시 0 으로 시작 OK)
update public.posts p
  set like_count = coalesce((select count(*) from public.post_likes l where l.post_id = p.id), 0)
  where like_count is distinct from coalesce((select count(*) from public.post_likes l where l.post_id = p.id), 0);

notify pgrst, 'reload schema';
