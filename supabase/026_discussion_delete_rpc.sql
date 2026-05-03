-- ──────────────────────────────────────────────
-- 026: 글·댓글 soft delete RPC
-- 문제: UPDATE deleted_at = now() 실행 후 새 row가 SELECT RLS (deleted_at is null) 에 걸림
--       → "new row violates row-level security policy" 에러
-- 해결: security definer RPC로 RLS 우회. 본인 또는 어드민만 호출 허용.
-- ──────────────────────────────────────────────

create or replace function public.delete_apt_discussion(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_is_admin boolean;
begin
  if v_uid is null then raise exception 'login required'; end if;
  select author_id into v_author from public.apt_discussions where id = p_id;
  if v_author is null then raise exception 'not found'; end if;
  select coalesce(is_admin, false) into v_is_admin from public.profiles where id = v_uid;
  if v_author <> v_uid and not v_is_admin then raise exception 'forbidden'; end if;
  update public.apt_discussions set deleted_at = now() where id = p_id;
end;
$$;

grant execute on function public.delete_apt_discussion(bigint) to authenticated;

create or replace function public.delete_apt_discussion_comment(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_is_admin boolean;
begin
  if v_uid is null then raise exception 'login required'; end if;
  select author_id into v_author from public.apt_discussion_comments where id = p_id;
  if v_author is null then raise exception 'not found'; end if;
  select coalesce(is_admin, false) into v_is_admin from public.profiles where id = v_uid;
  if v_author <> v_uid and not v_is_admin then raise exception 'forbidden'; end if;
  update public.apt_discussion_comments set deleted_at = now() where id = p_id;
end;
$$;

grant execute on function public.delete_apt_discussion_comment(bigint) to authenticated;

comment on function public.delete_apt_discussion is '글 soft delete. 본인 또는 어드민만 호출.';
comment on function public.delete_apt_discussion_comment is '댓글 soft delete. 본인 또는 어드민만 호출.';
