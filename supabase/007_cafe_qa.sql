-- ──────────────────────────────────────────────
-- 007: 카페 Q&A (Phase 5a) — 카페 글 적재 + 임베딩
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- pgvector 확장
create extension if not exists vector;

-- 1. cafe_posts: 어드민이 업로드한 카페 원본 글
create table if not exists public.cafe_posts (
  id bigserial primary key,
  source text default 'melnberg' not null,    -- 카페 식별자 (확장 대비)
  external_id text,                            -- 카페 글 ID (있으면)
  external_url text,                           -- 원본 URL
  title text not null,
  content text not null,
  posted_at timestamp with time zone,          -- 카페에 올라간 시점
  ingested_at timestamp with time zone default now() not null,
  ingested_by uuid references public.profiles(id)
);

create index if not exists cafe_posts_posted_at_idx on public.cafe_posts (posted_at desc nulls last);
create unique index if not exists cafe_posts_external_uniq on public.cafe_posts (source, external_id) where external_id is not null;

-- 2. cafe_post_chunks: 임베딩 단위 (긴 글은 의미 단위로 쪼갬)
create table if not exists public.cafe_post_chunks (
  id bigserial primary key,
  post_id bigint not null references public.cafe_posts(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),                      -- OpenAI text-embedding-3-small dimension
  created_at timestamp with time zone default now() not null
);

create index if not exists cafe_post_chunks_post_id_idx on public.cafe_post_chunks (post_id, chunk_index);
create index if not exists cafe_post_chunks_embedding_idx
  on public.cafe_post_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 3. RLS — 카페 글 원본은 어드민만 직접 조회·수정 가능 (Q&A 검색은 RPC 사용)
alter table public.cafe_posts enable row level security;
alter table public.cafe_post_chunks enable row level security;

drop policy if exists "Admins can read cafe posts" on public.cafe_posts;
create policy "Admins can read cafe posts"
  on public.cafe_posts for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can write cafe posts" on public.cafe_posts;
create policy "Admins can write cafe posts"
  on public.cafe_posts for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can read cafe chunks" on public.cafe_post_chunks;
create policy "Admins can read cafe chunks"
  on public.cafe_post_chunks for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can write cafe chunks" on public.cafe_post_chunks;
create policy "Admins can write cafe chunks"
  on public.cafe_post_chunks for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- 4. 벡터 유사도 검색 RPC (Q&A에서 호출, RLS 우회 위해 SECURITY DEFINER)
create or replace function public.search_cafe_chunks(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  chunk_id bigint,
  post_id bigint,
  chunk_content text,
  similarity float,
  post_title text,
  external_url text,
  posted_at timestamp with time zone
)
language sql stable
security definer set search_path = public
as $$
  select
    c.id as chunk_id,
    c.post_id,
    c.content as chunk_content,
    1 - (c.embedding <=> query_embedding) as similarity,
    p.title as post_title,
    p.external_url,
    p.posted_at
  from public.cafe_post_chunks c
  join public.cafe_posts p on p.id = c.post_id
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
