-- ──────────────────────────────────────────────
-- 072: 본인 글에 본인이 단 댓글도 피드 알림에 포함
-- 기존: v_post_author = new.author_id 면 skip → 텔레그램은 오는데 피드는 비어있는 비대칭
-- 변경: post 자체가 사라진 경우만 skip
-- ──────────────────────────────────────────────

create or replace function public.notify_community_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_actor_name text;
begin
  select author_id into v_post_author from public.posts where id = new.post_id;
  if v_post_author is null then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.author_id;
  insert into public.notifications(recipient_id, type, post_id, comment_id, comment_excerpt, actor_id, actor_name)
  values (v_post_author, 'community_comment', new.post_id, new.id, left(coalesce(new.content, ''), 80), new.author_id, v_actor_name);
  return new;
end;
$$;
