-- ──────────────────────────────────────────────
-- 188: 글 삭제 RPC (soft delete) — RLS 우회 + author 검증
-- 클라이언트 직접 update 시 silent fail (RLS 차단 또는 with_check 누락)
-- 사례 — realty/stocks 글 삭제 안 됨. security definer RPC 로 처방.
-- ──────────────────────────────────────────────

create or replace function public.delete_post(p_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select author_id into v_author from public.posts where id = p_id and deleted_at is null;
  if v_author is null then return query select false, '글을 찾을 수 없어요'::text; return; end if;
  if v_author <> v_uid then return query select false, '본인 글만 삭제 가능'::text; return; end if;
  update public.posts set deleted_at = now(), updated_at = now() where id = p_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.delete_post(bigint) to authenticated;

notify pgrst, 'reload schema';
