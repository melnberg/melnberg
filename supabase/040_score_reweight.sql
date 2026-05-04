-- ──────────────────────────────────────────────
-- 040: get_user_score 가중치 재조정
-- 게시글 1점 / 게시글 댓글 0.7점 / 아파트글 1점 / 아파트 댓글 0.5점
-- ──────────────────────────────────────────────

create or replace function public.get_user_score(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    -- 아파트 토론
    coalesce((select count(*) from public.apt_discussions
              where author_id = p_user_id and deleted_at is null), 0)::numeric * 1.0
    + coalesce((select count(*) from public.apt_discussion_comments
                where author_id = p_user_id and deleted_at is null), 0)::numeric * 0.5
    -- 커뮤니티 글/댓글
    + coalesce((select count(*) from public.posts
                where author_id = p_user_id), 0)::numeric * 1.0
    + coalesce((select count(*) from public.comments
                where author_id = p_user_id), 0)::numeric * 0.7;
$$;

grant execute on function public.get_user_score(uuid) to anon, authenticated;
