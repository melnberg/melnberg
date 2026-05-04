-- ──────────────────────────────────────────────
-- 032: get_user_score 확장 — 커뮤니티 posts/comments 도 포함
-- 가중치: 글 1점 + 댓글 0.7점 (apt 토론·커뮤니티 동일)
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
                where author_id = p_user_id and deleted_at is null), 0)::numeric * 0.7
    -- 커뮤니티 글/댓글
    + coalesce((select count(*) from public.posts
                where author_id = p_user_id), 0)::numeric * 1.0
    + coalesce((select count(*) from public.comments
                where author_id = p_user_id), 0)::numeric * 0.7;
$$;

grant execute on function public.get_user_score(uuid) to anon, authenticated;
