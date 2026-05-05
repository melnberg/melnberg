-- ──────────────────────────────────────────────
-- 057: mlbg 적립 가중치 변경
-- 변경: 커뮤니티 글 1점 → 2점 / 커뮤니티 댓글 0.7점 → 0.3점
-- 기존: 아파트글 1점 / 아파트 댓글 0.5점 (그대로)
-- ──────────────────────────────────────────────

create or replace function public.get_user_score(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    -- 아파트 토론 글·댓글 (변경 없음)
    coalesce((select count(*) from public.apt_discussions
              where author_id = p_user_id and deleted_at is null), 0)::numeric * 1.0
    + coalesce((select count(*) from public.apt_discussion_comments
                where author_id = p_user_id and deleted_at is null), 0)::numeric * 0.5
    -- 커뮤니티 글 (1 → 2)
    + coalesce((select count(*) from public.posts
                where author_id = p_user_id), 0)::numeric * 2.0
    -- 커뮤니티 댓글 (0.7 → 0.3)
    + coalesce((select count(*) from public.comments
                where author_id = p_user_id), 0)::numeric * 0.3;
$$;

-- 동일하게 top scorers RPC 도 업데이트
create or replace function public.get_top_scorers(p_limit int default 5)
returns table(user_id uuid, display_name text, score numeric)
language sql
stable
security definer
set search_path = public
as $$
  with
    apt_posts as (
      select author_id as uid, count(*)::numeric * 1.0 as s
      from public.apt_discussions where deleted_at is null
      group by author_id
    ),
    apt_comments as (
      select author_id as uid, count(*)::numeric * 0.5 as s
      from public.apt_discussion_comments where deleted_at is null
      group by author_id
    ),
    posts_s as (
      select author_id as uid, count(*)::numeric * 2.0 as s
      from public.posts
      group by author_id
    ),
    comments_s as (
      select author_id as uid, count(*)::numeric * 0.3 as s
      from public.comments
      group by author_id
    ),
    combined as (
      select uid, sum(s) as score
      from (
        select uid, s from apt_posts
        union all select uid, s from apt_comments
        union all select uid, s from posts_s
        union all select uid, s from comments_s
      ) u
      group by uid
    )
  select c.uid as user_id, p.display_name, c.score
  from combined c
  join public.profiles p on p.id = c.uid
  where c.score > 0 and p.display_name is not null
  order by c.score desc, p.display_name asc
  limit p_limit;
$$;
