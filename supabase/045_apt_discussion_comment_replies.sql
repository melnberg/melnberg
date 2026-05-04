-- ──────────────────────────────────────────────
-- 045: 아파트 토론방 댓글에 대댓글(replies) 추가
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

alter table public.apt_discussion_comments
  add column if not exists parent_id bigint
    references public.apt_discussion_comments(id) on delete cascade;

-- 부모 단위 정렬용 인덱스
create index if not exists apt_discussion_comments_parent_idx
  on public.apt_discussion_comments (parent_id, created_at)
  where deleted_at is null;

-- 깊이 1단계만 허용 (대댓글의 대댓글은 부모 댓글에 평면으로 달리게)
-- → parent_id 가 가리키는 댓글은 자체 parent_id 가 null 이어야 함
create or replace function public.check_apt_discussion_comment_depth()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.apt_discussion_comments
      where id = new.parent_id and parent_id is not null
    ) then
      raise exception '대댓글은 1단계까지만 가능합니다.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists apt_discussion_comments_depth on public.apt_discussion_comments;
create trigger apt_discussion_comments_depth
  before insert or update on public.apt_discussion_comments
  for each row execute function public.check_apt_discussion_comment_depth();

comment on column public.apt_discussion_comments.parent_id is '대댓글이면 부모 댓글 id. 깊이 1단계 제한 (트리거).';
