-- ──────────────────────────────────────────────
-- 016: 카페 검색 성능 개선 — HNSW 벡터 인덱스 + trigram 인덱스
-- 목적: search_cafe_chunks_hybrid 응답 시간 3초 → 1초 이하
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 주의: HNSW 인덱스 생성은 수십 초 ~ 수 분 걸릴 수 있음 (1만 청크 기준 ~30초)
-- ──────────────────────────────────────────────

-- ═══ Part 1: 벡터 인덱스 ivfflat → HNSW ═══
-- HNSW: ivfflat보다 정확도·속도 모두 우위. lists 튜닝 불필요. 메모리 사용량은 약간 더 큼.
-- 다만 INSERT 속도는 ivfflat보다 느림 (우리는 카페 글 적재가 드물어서 OK)

drop index if exists cafe_post_chunks_embedding_idx;

create index if not exists cafe_post_chunks_embedding_hnsw_idx
  on public.cafe_post_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
-- m = 16 (권장 기본), ef_construction = 64 (정확도/빌드시간 트레이드오프)

-- 검색 시 정확도 파라미터 — 함수 안에서 SET LOCAL로 조정 (016b에서 함수 업데이트)

-- ═══ Part 2: trigram 인덱스 — ilike '%keyword%' 가속 ═══
-- 하이브리드 검색의 키워드 매치는 title/content에 ilike를 씀.
-- 기본 인덱스로는 '%keyword%' 형태가 sequential scan으로 떨어짐 → 1만 청크 × 6 키워드 = 6만 비교.
-- pg_trgm + gin 인덱스로 substring 매치를 인덱스로 처리.

create extension if not exists pg_trgm;

create index if not exists cafe_post_chunks_content_trgm_idx
  on public.cafe_post_chunks
  using gin (content gin_trgm_ops);

create index if not exists cafe_posts_title_trgm_idx
  on public.cafe_posts
  using gin (title gin_trgm_ops);

-- ═══ Part 3: 함수 안에서 hnsw.ef_search 설정 ═══
-- 검색 정확도/속도 트레이드오프. ef_search 클수록 정확하지만 느려짐. 1만 청크 + top-10이면 기본 40으로 충분.

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
language plpgsql stable
security definer set search_path = public
as $$
begin
  -- HNSW 검색 — ef_search 40 (1만 청크 + top-10에 충분)
  perform set_config('hnsw.ef_search', '40', true);

  return query
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
    d.chunk_id,
    d.post_id,
    d.chunk_content,
    case when d.priority = 0 then 0.9 + (d.raw_score * 0.02) else d.raw_score end as similarity,
    d.post_title,
    d.external_url,
    d.posted_at
  from dedup d
  order by d.priority asc, d.raw_score desc
  limit match_count;
end;
$$;

-- ═══ 검증 ═══
-- 적용 후 다음 쿼리로 응답 시간 비교:
--   explain (analyze, buffers)
--   select * from search_cafe_chunks_hybrid(
--     (select embedding from cafe_post_chunks where embedding is not null limit 1),
--     array['도곡렉슬', '시세'],
--     10
--   );
