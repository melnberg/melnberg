-- ──────────────────────────────────────────────
-- 041: 알림 (notifications) — 내 글에 댓글 달리면 자동 생성
-- ──────────────────────────────────────────────

create table if not exists public.notifications (
  id bigserial primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('community_comment','apt_comment')),
  post_id bigint,                  -- community posts.id (type='community_comment')
  apt_discussion_id bigint,        -- apt_discussions.id (type='apt_comment')
  apt_master_id bigint,            -- 단지 정보 (apt_comment)
  comment_id bigint,
  comment_excerpt text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "recipient reads own notifications" on public.notifications;
create policy "recipient reads own notifications"
  on public.notifications for select
  using (recipient_id = auth.uid());

drop policy if exists "recipient updates own notifications" on public.notifications;
create policy "recipient updates own notifications"
  on public.notifications for update
  using (recipient_id = auth.uid());

drop policy if exists "recipient deletes own notifications" on public.notifications;
create policy "recipient deletes own notifications"
  on public.notifications for delete
  using (recipient_id = auth.uid());

-- 1) 커뮤니티 댓글 → 글 작성자에게 알림
create or replace function public.notify_community_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_actor_name text;
begin
  select author_id into v_post_author from public.posts where id = new.post_id;
  if v_post_author is null or v_post_author = new.author_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.author_id;
  insert into public.notifications(recipient_id, type, post_id, comment_id, comment_excerpt, actor_id, actor_name)
  values (v_post_author, 'community_comment', new.post_id, new.id, left(coalesce(new.content, ''), 80), new.author_id, v_actor_name);
  return new;
end;
$$;

drop trigger if exists trg_notify_community_comment on public.comments;
create trigger trg_notify_community_comment
  after insert on public.comments
  for each row execute function public.notify_community_comment();

-- 2) 아파트 댓글 → 아파트 글 작성자에게 알림
create or replace function public.notify_apt_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disc_author uuid;
  v_apt_id bigint;
  v_actor_name text;
begin
  select author_id, apt_master_id into v_disc_author, v_apt_id
    from public.apt_discussions where id = new.discussion_id;
  if v_disc_author is null or v_disc_author = new.author_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.author_id;
  insert into public.notifications(recipient_id, type, apt_discussion_id, apt_master_id, comment_id, comment_excerpt, actor_id, actor_name)
  values (v_disc_author, 'apt_comment', new.discussion_id, v_apt_id, new.id, left(coalesce(new.content, ''), 80), new.author_id, v_actor_name);
  return new;
end;
$$;

drop trigger if exists trg_notify_apt_comment on public.apt_discussion_comments;
create trigger trg_notify_apt_comment
  after insert on public.apt_discussion_comments
  for each row execute function public.notify_apt_comment();

comment on table public.notifications is '내 글에 댓글이 달리면 자동 생성. 종 아이콘 + 빨간 뱃지로 표시.';
