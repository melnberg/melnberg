-- ──────────────────────────────────────────────
-- 050: 스코어 랭킹 top N RPC
-- get_user_score 와 같은 가중치: apt글 1·apt댓글 0.5·커뮤글 1·커뮤댓글 0.7
-- 단일 쿼리로 모든 사용자 점수 집계 후 top N (반복 함수 호출보다 훨씬 빠름)
-- ──────────────────────────────────────────────

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
      select author_id as uid, count(*)::numeric * 1.0 as s
      from public.posts
      group by author_id
    ),
    comments_s as (
      select author_id as uid, count(*)::numeric * 0.7 as s
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

grant execute on function public.get_top_scorers(int) to anon, authenticated;

comment on function public.get_top_scorers is '스코어 랭킹 top N. 가중치는 get_user_score 와 동일.';
