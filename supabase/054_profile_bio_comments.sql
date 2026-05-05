-- ──────────────────────────────────────────────
-- 054: 자기소개 페이지 댓글 + 알림
-- 다른 조합원이 자기소개에 댓글 달면 프로필 주인에게 알림
-- ──────────────────────────────────────────────

create table if not exists public.profile_bio_comments (
  id bigserial primary key,
  profile_user_id uuid not null references auth.users(id) on delete cascade,  -- 자기소개 주인
  author_id uuid not null references auth.users(id) on delete cascade,        -- 댓글 작성자
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profile_bio_comments_profile_idx
  on public.profile_bio_comments(profile_user_id, created_at desc)
  where deleted_at is null;
create index if not exists profile_bio_comments_author_idx
  on public.profile_bio_comments(author_id, created_at desc)
  where deleted_at is null;

alter table public.profile_bio_comments enable row level security;

-- 누구나 (비로그인 포함) 읽기 가능 — 자기소개 페이지는 공개
drop policy if exists "anyone can read bio comments" on public.profile_bio_comments;
create policy "anyone can read bio comments"
  on public.profile_bio_comments for select using (deleted_at is null);

-- 조합원만 댓글 작성 (본인 프로필엔 못 달게 + 활성 paid 만)
drop policy if exists "paid members can write bio comments" on public.profile_bio_comments;
create policy "paid members can write bio comments"
  on public.profile_bio_comments for insert
  with check (
    auth.uid() = author_id
    and auth.uid() <> profile_user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tier = 'paid'
        and (p.tier_expires_at is null or p.tier_expires_at > now())
    )
  );

-- 본인 댓글 또는 어드민이 삭제
drop policy if exists "authors and admins delete bio comments" on public.profile_bio_comments;
create policy "authors and admins delete bio comments"
  on public.profile_bio_comments for delete
  using (
    auth.uid() = author_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- notifications 에 'bio_comment' 타입 추가
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('community_comment','apt_comment','apt_evicted','feedback_reply','admin_notice','bio_comment'));

-- 댓글 INSERT 시 프로필 주인에게 알림 (본인 댓글은 알림 X)
create or replace function public.notify_bio_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  if new.author_id = new.profile_user_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.author_id;
  insert into public.notifications(recipient_id, type, actor_id, actor_name, comment_excerpt)
  values (new.profile_user_id, 'bio_comment', new.author_id, v_actor_name, left(new.content, 80));
  return new;
end;
$$;

drop trigger if exists trg_notify_bio_comment on public.profile_bio_comments;
create trigger trg_notify_bio_comment
  after insert on public.profile_bio_comments
  for each row execute function public.notify_bio_comment();

comment on table public.profile_bio_comments is '자기소개 페이지 댓글. 조합원만 작성 가능, 본인 프로필은 X.';
