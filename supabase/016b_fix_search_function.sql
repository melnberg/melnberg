-- ──────────────────────────────────────────────
-- 016b: search_cafe_chunks_hybrid 함수 복구
-- 016에서 plpgsql로 바꾼 버전이 chunk_id 컬럼 충돌 — language sql로 되돌림
-- HNSW 기본 ef_search가 40이라 set_config 불필요
-- ──────────────────────────────────────────────

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
