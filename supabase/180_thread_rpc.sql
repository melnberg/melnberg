-- ──────────────────────────────────────────────
-- 180: 스레드 수정·삭제 RPC (RLS 우회 + 본인 검증)
-- 클라이언트 직접 update 시 RLS WITH CHECK 와 미세한 충돌 사례 회피.
-- security definer 라 RLS 우회, 함수 안에서 author_id 비교로 안전.
-- ──────────────────────────────────────────────

create or replace function public.delete_thread(p_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select author_id into v_author from public.threads where id = p_id and deleted_at is null;
  if v_author is null then return query select false, '글을 찾을 수 없어요'::text; return; end if;
  if v_author <> v_uid then return query select false, '본인 글만 삭제 가능'::text; return; end if;
  update public.threads set deleted_at = now() where id = p_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.delete_thread(bigint) to authenticated;

create or replace function public.update_thread(p_id bigint, p_content text)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  if length(trim(coalesce(p_content, ''))) = 0 then return query select false, '내용을 입력하세요'::text; return; end if;
  if length(p_content) > 1000 then return query select false, '1000자 이내로'::text; return; end if;
  select author_id into v_author from public.threads where id = p_id and deleted_at is null;
  if v_author is null then return query select false, '글을 찾을 수 없어요'::text; return; end if;
  if v_author <> v_uid then return query select false, '본인 글만 수정 가능'::text; return; end if;
  update public.threads set content = trim(p_content) where id = p_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.update_thread(bigint, text) to authenticated;

notify pgrst, 'reload schema';
