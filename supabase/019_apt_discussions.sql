-- ──────────────────────────────────────────────
-- 019: 아파트 토론방 — 글 + 추천/비추천
-- 단지 단위 토론 (apt_master_id로 연결). 댓글은 향후 마이그레이션에서.
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- ─── 1. 글 테이블 ─────────────────────────────────────
create table if not exists public.apt_discussions (
  id bigserial primary key,
  apt_master_id bigint not null references public.apt_master(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  content text not null check (char_length(trim(content)) > 0),
  -- 추천/비추천 카운트 — 표 시 빠른 조회를 위해 denormalized. votes 테이블 트리거로 동기화.
  vote_up_count int not null default 0,
  vote_down_count int not null default 0,
  -- 신고·삭제 상태
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apt_discussions_apt_master_idx
  on public.apt_discussions (apt_master_id, created_at desc)
  where deleted_at is null;
create index if not exists apt_discussions_author_idx
  on public.apt_discussions (author_id, created_at desc)
  where deleted_at is null;
create index if not exists apt_discussions_score_idx
  on public.apt_discussions ((vote_up_count - vote_down_count) desc)
  where deleted_at is null;

-- updated_at 자동 갱신
create or replace function public.touch_apt_discussions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists apt_discussions_touch on public.apt_discussions;
create trigger apt_discussions_touch
  before update on public.apt_discussions
  for each row execute function public.touch_apt_discussions_updated_at();

-- ─── 2. 추천/비추천 테이블 ────────────────────────────
-- (discussion_id, user_id) 유니크 — 한 사람당 한 번만 vote
create table if not exists public.apt_discussion_votes (
  id bigserial primary key,
  discussion_id bigint not null references public.apt_discussions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_type text not null check (vote_type in ('up', 'down')),
  created_at timestamptz not null default now(),
  unique (discussion_id, user_id)
);

create index if not exists apt_discussion_votes_user_idx
  on public.apt_discussion_votes (user_id);

-- 추천 변경 시 글 카운트 동기화 트리거
create or replace function public.sync_apt_discussion_vote_count()
returns trigger language plpgsql security definer as $$
begin
  if (tg_op = 'INSERT') then
    if new.vote_type = 'up' then
      update public.apt_discussions set vote_up_count = vote_up_count + 1 where id = new.discussion_id;
    else
      update public.apt_discussions set vote_down_count = vote_down_count + 1 where id = new.discussion_id;
    end if;
  elsif (tg_op = 'UPDATE') then
    -- vote_type 변경 (up ↔ down)
    if old.vote_type <> new.vote_type then
      if new.vote_type = 'up' then
        update public.apt_discussions
          set vote_up_count = vote_up_count + 1, vote_down_count = greatest(0, vote_down_count - 1)
          where id = new.discussion_id;
      else
        update public.apt_discussions
          set vote_down_count = vote_down_count + 1, vote_up_count = greatest(0, vote_up_count - 1)
          where id = new.discussion_id;
      end if;
    end if;
  elsif (tg_op = 'DELETE') then
    if old.vote_type = 'up' then
      update public.apt_discussions set vote_up_count = greatest(0, vote_up_count - 1) where id = old.discussion_id;
    else
      update public.apt_discussions set vote_down_count = greatest(0, vote_down_count - 1) where id = old.discussion_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists apt_discussion_votes_sync on public.apt_discussion_votes;
create trigger apt_discussion_votes_sync
  after insert or update or delete on public.apt_discussion_votes
  for each row execute function public.sync_apt_discussion_vote_count();

-- ─── 3. 동/구 단위 집계 view (동네 대항전 시각화용) ─────
-- 글 수 + 합산 score를 동 단위로 묶음. 클러스터 색상 결정에 사용.
create or replace view public.apt_discussion_dong_stats as
select
  am.lawd_cd,
  am.dong,
  count(distinct ad.id) as discussion_count,
  count(distinct ad.author_id) as author_count,
  coalesce(sum(ad.vote_up_count), 0)::int as total_up,
  coalesce(sum(ad.vote_down_count), 0)::int as total_down,
  coalesce(sum(ad.vote_up_count - ad.vote_down_count), 0)::int as net_score
from public.apt_master am
left join public.apt_discussions ad
  on ad.apt_master_id = am.id and ad.deleted_at is null
where am.dong is not null
group by am.lawd_cd, am.dong;

-- ─── 4. RLS ──────────────────────────────────────────
alter table public.apt_discussions enable row level security;
alter table public.apt_discussion_votes enable row level security;

-- 글: 누구나 읽기 (비회원 포함). 작성·수정·삭제는 본인만 (어드민은 모두 가능).
drop policy if exists "Anyone can read apt_discussions" on public.apt_discussions;
create policy "Anyone can read apt_discussions"
  on public.apt_discussions for select using (deleted_at is null);

drop policy if exists "Auth users can write own apt_discussions" on public.apt_discussions;
create policy "Auth users can write own apt_discussions"
  on public.apt_discussions for insert
  with check (auth.uid() = author_id);

drop policy if exists "Authors can update own apt_discussions" on public.apt_discussions;
create policy "Authors can update own apt_discussions"
  on public.apt_discussions for update
  using (auth.uid() = author_id or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (auth.uid() = author_id or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Authors can delete own apt_discussions" on public.apt_discussions;
create policy "Authors can delete own apt_discussions"
  on public.apt_discussions for delete
  using (auth.uid() = author_id or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- 추천: 본인 vote만 read·write 가능 (다른 사람이 어떻게 vote했는지는 카운트로만 노출)
-- 어드민은 전체 read (악용 추적용)
drop policy if exists "Users can read own votes" on public.apt_discussion_votes;
create policy "Users can read own votes"
  on public.apt_discussion_votes for select
  using (auth.uid() = user_id or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Auth users can write own votes" on public.apt_discussion_votes;
create policy "Auth users can write own votes"
  on public.apt_discussion_votes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can change own votes" on public.apt_discussion_votes;
create policy "Users can change own votes"
  on public.apt_discussion_votes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete own votes" on public.apt_discussion_votes;
create policy "Users can delete own votes"
  on public.apt_discussion_votes for delete
  using (auth.uid() = user_id);

comment on table public.apt_discussions is '아파트 단지별 토론 글. apt_master_id로 단지에 연결.';
comment on table public.apt_discussion_votes is '글 단위 추천/비추천. (discussion_id, user_id) unique.';
comment on view public.apt_discussion_dong_stats is '동/구 단위 토론 활동 집계 — 클러스터 색상·동네 대항전 시각화용.';
