-- ──────────────────────────────────────────────
-- 014: 메타데이터 풀 셋업 (012 + 013 통합본)
-- 한 번만 실행하면 컬럼 추가 + 검색 RPC 업그레이드 둘 다 끝남
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- ═══ Part 1: 메타데이터 컬럼 추가 ═══

alter table public.cafe_posts
  add column if not exists category text,
  add column if not exists content_type text,
  add column if not exists series_name text,
  add column if not exists series_number int,
  add column if not exists regions text[] default '{}',
  add column if not exists topics text[] default '{}',
  add column if not exists is_meaningful boolean default true,
  add column if not exists metadata_extracted_at timestamp with time zone;

create index if not exists cafe_posts_regions_idx
  on public.cafe_posts using gin (regions);

create index if not exists cafe_posts_topics_idx
  on public.cafe_posts using gin (topics);

create index if not exists cafe_posts_meaningful_idx
  on public.cafe_posts (is_meaningful)
  where is_meaningful = false;

create index if not exists cafe_posts_metadata_extracted_idx
  on public.cafe_posts (metadata_extracted_at)
  where metadata_extracted_at is null;

create or replace view public.cafe_posts_metadata_stats as
select
  count(*)                                                        as total,
  count(metadata_extracted_at)                                    as enriched,
  count(*) filter (where is_meaningful = false)                   as filtered_out,
  (select count(distinct r) from cafe_posts, unnest(regions) as r) as unique_regions,
  (select count(distinct t) from cafe_posts, unnest(topics) as t)  as unique_topics
from public.cafe_posts;

-- ═══ Part 2: 하이브리드 검색에 메타데이터 필터 적용 ═══
-- forgiving 정책: 메타 없는 글(NULL)은 통과시킴 → 추출 진행 중에도 안전

create or replace function public.search_cafe_chunks_hybrid(
  query_embedding vector(1536),
  keywords text[],
  match_count int default 20
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
  with keyword_hits as (
    select
      c.id as chunk_id,
      c.post_id,
      c.content as chunk_content,
      p.title as post_title,
      p.external_url,
      p.posted_at,
      (
        select count(*)::int
        from unnest(coalesce(keywords, array[]::text[])) k
        where p.title ilike '%' || k || '%'
           or c.content ilike '%' || k || '%'
      ) as kw_match_count
    from public.cafe_post_chunks c
    join public.cafe_posts p on p.id = c.post_id
    where coalesce(array_length(keywords, 1), 0) > 0
      and (p.is_meaningful is not false)
      and (p.category is null or p.category = '콘텐츠')
      and exists (
        select 1 from unnest(keywords) k
        where p.title ilike '%' || k || '%'
           or c.content ilike '%' || k || '%'
      )
    order by kw_match_count desc
    limit match_count
  ),
  vector_hits as (
    select
      c.id as chunk_id,
      c.post_id,
      c.content as chunk_content,
      p.title as post_title,
      p.external_url,
      p.posted_at,
      (1 - (c.embedding <=> query_embedding))::float as vec_score
    from public.cafe_post_chunks c
    join public.cafe_posts p on p.id = c.post_id
    where c.embedding is not null
      and (p.is_meaningful is not false)
      and (p.category is null or p.category = '콘텐츠')
    order by c.embedding <=> query_embedding
    limit match_count
  ),
  combined as (
    select 0 as priority, kw_match_count::float as raw_score,
           chunk_id, post_id, chunk_content, post_title, external_url, posted_at
    from keyword_hits
    union all
    select 1 as priority, vec_score as raw_score,
           chunk_id, post_id, chunk_content, post_title, external_url, posted_at
    from vector_hits
  ),
  dedup as (
    select distinct on (chunk_id)
      chunk_id, post_id, chunk_content, raw_score, post_title, external_url, posted_at, priority
    from combined
    order by chunk_id, priority asc, raw_score desc
  )
  select
    chunk_id,
    post_id,
    chunk_content,
    case when priority = 0 then 0.9 + (raw_score * 0.02) else raw_score end as similarity,
    post_title,
    external_url,
    posted_at
  from dedup
  order by priority asc, raw_score desc
  limit match_count;
$$;
