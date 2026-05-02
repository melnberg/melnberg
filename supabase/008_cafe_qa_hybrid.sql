-- ──────────────────────────────────────────────
-- 008: 카페 Q&A 하이브리드 검색 (키워드 + 벡터)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 목적: 벡터 임베딩이 고유명사(지역명, 단지명 등)를 놓치는 문제 해결
--   - 질문에서 추출한 키워드로 ilike 매칭한 글에 우선순위 부여
--   - 그 외는 벡터 유사도로 보충
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
    -- 같은 청크가 양쪽에 있으면 키워드 쪽(priority=0) 우선
    select distinct on (chunk_id)
      chunk_id, post_id, chunk_content, raw_score, post_title, external_url, posted_at, priority
    from combined
    order by chunk_id, priority asc, raw_score desc
  )
  select
    chunk_id,
    post_id,
    chunk_content,
    -- 키워드 매칭은 0.9~1.0대, 벡터는 원래 cosine similarity 사용
    case when priority = 0 then 0.9 + (raw_score * 0.02) else raw_score end as similarity,
    post_title,
    external_url,
    posted_at
  from dedup
  order by priority asc, raw_score desc
  limit match_count;
$$;
