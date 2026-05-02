-- ──────────────────────────────────────────────
-- 012: 카페 글 메타데이터 컬럼 추가
-- 목적: 카테고리·지역·주제 등을 자동 추출해서 검색·필터에 활용
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

alter table public.cafe_posts
  add column if not exists category text,                       -- '공지' | '콘텐츠' | '운영' | '링크모음'
  add column if not exists content_type text,                   -- '주주서한' | '첫집마련' | '정비사업' | '지역분석' | '케이스스터디' | '시장분석' | null
  add column if not exists series_name text,                    -- '첫집마련' | null
  add column if not exists series_number int,                   -- 119 | null
  add column if not exists regions text[] default '{}',         -- ['잠원동', '강남구']
  add column if not exists topics text[] default '{}',          -- ['재건축', '토허제', '시드머니']
  add column if not exists is_meaningful boolean default true,  -- 운영성 글이면 false (검색에서 제외)
  add column if not exists metadata_extracted_at timestamp with time zone;

-- 검색 최적화용 인덱스
create index if not exists cafe_posts_regions_idx
  on public.cafe_posts using gin (regions);

create index if not exists cafe_posts_topics_idx
  on public.cafe_posts using gin (topics);

create index if not exists cafe_posts_meaningful_idx
  on public.cafe_posts (is_meaningful)
  where is_meaningful = false;  -- false인 것만 빠르게 필터

create index if not exists cafe_posts_metadata_extracted_idx
  on public.cafe_posts (metadata_extracted_at)
  where metadata_extracted_at is null;  -- 아직 처리 안 된 것 찾기 빠르게

-- 메타데이터 통계 뷰 (어드민용)
create or replace view public.cafe_posts_metadata_stats as
select
  count(*)                                                        as total,
  count(metadata_extracted_at)                                    as enriched,
  count(*) filter (where is_meaningful = false)                   as filtered_out,
  count(distinct unnest(regions))                                 as unique_regions,
  count(distinct unnest(topics))                                  as unique_topics
from public.cafe_posts;
