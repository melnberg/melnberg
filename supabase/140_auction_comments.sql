-- ──────────────────────────────────────────────
-- 140: 경매 댓글 (auction_comments) + mlbg_award_log 'auction_comment' kind 추가
-- 경매 페이지에서 입찰자들 / 관전자들이 채팅처럼 사용. 댓글 1개당 +0.5 mlbg.
-- ──────────────────────────────────────────────

create table if not exists public.auction_comments (
  id bigserial primary key,
  auction_id bigint not null references public.apt_auctions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists auction_comments_auction_idx
  on public.auction_comments(auction_id, created_at)
  where deleted_at is null;
create index if not exists auction_comments_author_idx
  on public.auction_comments(author_id);

alter table public.auction_comments enable row level security;

drop policy if exists "auction_comments readable by all" on public.auction_comments;
create policy "auction_comments readable by all"
  on public.auction_comments for select
  using (deleted_at is null);

drop policy if exists "auction_comments own insert" on public.auction_comments;
create policy "auction_comments own insert"
  on public.auction_comments for insert
  with check (auth.uid() = author_id);

drop policy if exists "auction_comments own delete" on public.auction_comments;
create policy "auction_comments own delete"
  on public.auction_comments for update
  using (auth.uid() = author_id);

-- mlbg_award_log 의 kind check 확장 — 'auction_comment' 추가
alter table public.mlbg_award_log drop constraint if exists mlbg_award_log_kind_check;
alter table public.mlbg_award_log
  add constraint mlbg_award_log_kind_check
  check (kind in (
    'apt_post','apt_comment',
    'community_post','community_comment',
    'hotdeal_post','hotdeal_comment',
    'factory_comment','emart_comment',
    'auction_comment'
  ));

notify pgrst, 'reload schema';
