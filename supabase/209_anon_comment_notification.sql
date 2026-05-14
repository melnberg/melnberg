-- ──────────────────────────────────────────────
-- 209: 익명 카테고리(worry 고민상담·love 연애상담) 댓글 알림 정정
--
-- 사고: 익명게시판 글에 댓글이 달리면
--   1) notifications.actor_name / actor_id 에 댓글 작성자 실명·UUID 저장
--      → 알림센터(NotificationsBell)에 댓글 단 사람 실명 노출
--   2) 알림 row 에 글 카테고리 정보가 없음
--      → 알림 클릭 시 무조건 /community/{post_id} 로 이동
--      → 익명 글이 커뮤니티 상세 페이지로 열려 작성자·댓글 실명 전부 노출
--
-- 해결:
--   1) notifications.post_category 컬럼 추가 — 라우팅·카테고리 라벨·익명 판정용
--   2) notify_community_comment 트리거: worry/love 면 actor 익명화, post_category 항상 기록
--   3) 기존 community_comment 알림 backfill — post_category 채우고 익명 카테고리는 actor 익명화
--   (앱 쪽: NotificationsBell 라우팅·표시 + /community/[id] 카테고리 불일치 시 redirect 로 보완)
-- ──────────────────────────────────────────────

alter table public.notifications
  add column if not exists post_category text;

create or replace function public.notify_community_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_post_category text;
  v_actor_id uuid;
  v_actor_name text;
begin
  select author_id, category into v_post_author, v_post_category
    from public.posts where id = new.post_id;
  if v_post_author is null then return new; end if;

  -- 익명 카테고리(고민상담 worry·연애상담 love)는 댓글 작성자 노출 금지
  if v_post_category in ('worry', 'love') then
    v_actor_id := null;
    v_actor_name := '익명';
  else
    v_actor_id := new.author_id;
    select display_name into v_actor_name from public.profiles where id = new.author_id;
  end if;

  insert into public.notifications(
    recipient_id, type, post_id, post_category, comment_id, comment_excerpt, actor_id, actor_name
  )
  values (
    v_post_author, 'community_comment', new.post_id, v_post_category, new.id,
    left(coalesce(new.content, ''), 80), v_actor_id, v_actor_name
  );
  return new;
end;
$$;

comment on function public.notify_community_comment is
  '209 — 커뮤니티 댓글 알림. worry/love 익명 카테고리는 actor 익명화, post_category 기록.';

-- backfill 1: 기존 community_comment 알림에 글 카테고리 채움
update public.notifications n
  set post_category = p.category
  from public.posts p
  where n.post_id = p.id
    and n.type = 'community_comment'
    and n.post_category is null;

-- backfill 2: 익명 카테고리 알림의 실명·UUID 제거 (이미 노출된 사고분 정정)
update public.notifications
  set actor_name = '익명', actor_id = null
  where type = 'community_comment'
    and post_category in ('worry', 'love')
    and (actor_id is not null or (actor_name is not null and actor_name <> '익명'));

notify pgrst, 'reload schema';
