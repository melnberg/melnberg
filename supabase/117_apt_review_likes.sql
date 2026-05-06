-- ──────────────────────────────────────────────
-- 117: 단지 리뷰 (apt_discussions) [찐리뷰♡] 좋아요
-- 누구나 누를 수 있고, 누를 때마다 글 작성자에게 +3 mlbg.
-- 본인 글엔 못 누름. 토글 (다시 누르면 -3 회수).
-- ──────────────────────────────────────────────

create table if not exists public.apt_discussion_likes (
  discussion_id bigint not null references public.apt_discussions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (discussion_id, user_id)
);
create index if not exists apt_discussion_likes_disc_idx on public.apt_discussion_likes(discussion_id);
create index if not exists apt_discussion_likes_user_idx on public.apt_discussion_likes(user_id);

alter table public.apt_discussion_likes enable row level security;
drop policy if exists "apt_discussion_likes readable by all" on public.apt_discussion_likes;
create policy "apt_discussion_likes readable by all"
  on public.apt_discussion_likes for select using (true);
drop policy if exists "apt_discussion_likes own write" on public.apt_discussion_likes;
create policy "apt_discussion_likes own write"
  on public.apt_discussion_likes for insert with check (auth.uid() = user_id);
drop policy if exists "apt_discussion_likes own delete" on public.apt_discussion_likes;
create policy "apt_discussion_likes own delete"
  on public.apt_discussion_likes for delete using (auth.uid() = user_id);

-- like_count denormalized 컬럼
alter table public.apt_discussions
  add column if not exists like_count int not null default 0;

-- 토글 RPC — 좋아요 ON/OFF, 작성자 mlbg ±3 동시 반영.
-- 본인 글엔 못 누름 (자기 좋아요 방지).
create or replace function public.toggle_apt_discussion_like(p_discussion_id bigint)
returns table(out_liked boolean, out_count int, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
  v_count int;
  v_author uuid;
begin
  if v_uid is null then
    return query select false, 0, '로그인이 필요해요'::text; return;
  end if;

  select author_id, coalesce(like_count, 0) into v_author, v_count
    from public.apt_discussions
    where id = p_discussion_id and deleted_at is null;
  if v_author is null then
    return query select false, 0, '리뷰를 찾을 수 없어요'::text; return;
  end if;
  if v_author = v_uid then
    return query select false, v_count, '본인 리뷰엔 못 눌러요'::text; return;
  end if;

  select count(*) into v_existing from public.apt_discussion_likes
    where discussion_id = p_discussion_id and user_id = v_uid;

  if v_existing > 0 then
    -- 좋아요 OFF — 작성자에게 -3 회수, like_count -1
    delete from public.apt_discussion_likes
      where discussion_id = p_discussion_id and user_id = v_uid;
    update public.apt_discussions
      set like_count = greatest(like_count - 1, 0)
      where id = p_discussion_id
      returning like_count into v_count;
    update public.profiles
      set mlbg_balance = greatest(coalesce(mlbg_balance, 0) - 3, 0)
      where id = v_author;
    return query select false, coalesce(v_count, 0), null::text;
  else
    -- 좋아요 ON — 작성자에게 +3 가산, like_count +1
    insert into public.apt_discussion_likes (discussion_id, user_id)
      values (p_discussion_id, v_uid);
    update public.apt_discussions
      set like_count = like_count + 1
      where id = p_discussion_id
      returning like_count into v_count;
    update public.profiles
      set mlbg_balance = coalesce(mlbg_balance, 0) + 3
      where id = v_author;
    return query select true, coalesce(v_count, 0), null::text;
  end if;
end;
$$;
grant execute on function public.toggle_apt_discussion_like(bigint) to authenticated;

-- 백필 — 기존 like_count = 실제 카운트 (안전망)
update public.apt_discussions d
  set like_count = coalesce((select count(*) from public.apt_discussion_likes l where l.discussion_id = d.id), 0)
  where like_count is distinct from coalesce((select count(*) from public.apt_discussion_likes l where l.discussion_id = d.id), 0);

notify pgrst, 'reload schema';
