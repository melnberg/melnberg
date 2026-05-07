-- ──────────────────────────────────────────────
-- 170: 내 가게 (my_stores) 수정·삭제 RPC
--   - update_my_store: 본인만, verified 유지, lat/lng/주소도 변경 가능
--   - delete_my_store: 본인만 soft delete (deleted_at = now())
--     · 좋아요·댓글은 그대로 둠 (FK cascade X)
--     · mlbg 환수 X (사용자 의지 등록 보상)
-- 추가 마이그레이션:
--   - author_id 의 일반 UNIQUE 를 partial unique index 로 교체
--     → soft delete 후 동일 사용자 재등록 가능
-- ──────────────────────────────────────────────

-- 1) UNIQUE constraint partial 화 (재등록 허용)
alter table public.my_stores drop constraint if exists my_stores_author_id_key;
drop index if exists my_stores_author_id_key;
create unique index if not exists my_stores_author_id_alive_uq
  on public.my_stores(author_id) where deleted_at is null;

-- 2) 수정 RPC
drop function if exists public.update_my_store(bigint, text, text, text, text, numeric, numeric, text, text, text, text, text);
create or replace function public.update_my_store(
  p_id bigint,
  p_name text, p_category text, p_description text, p_recommended text,
  p_lat numeric, p_lng numeric,
  p_photo_url text, p_address text, p_dong text,
  p_contact text, p_url text
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then return query select false, '가게명을 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_description, ''))) = 0 then return query select false, '설명을 입력하세요'::text; return; end if;
  if p_lat is null or p_lng is null then return query select false, '좌표가 필요해요'::text; return; end if;

  select author_id into v_author from public.my_stores
    where id = p_id and deleted_at is null;
  if v_author is null then return query select false, '가게를 찾을 수 없어요'::text; return; end if;
  if v_author <> v_uid then return query select false, '본인 가게만 수정 가능'::text; return; end if;

  update public.my_stores set
    name = trim(p_name),
    category = nullif(trim(coalesce(p_category, '')), ''),
    description = trim(p_description),
    recommended = nullif(trim(coalesce(p_recommended, '')), ''),
    lat = p_lat,
    lng = p_lng,
    photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), ''),
    dong = nullif(trim(coalesce(p_dong, '')), ''),
    contact = nullif(trim(coalesce(p_contact, '')), ''),
    url = nullif(trim(coalesce(p_url, '')), ''),
    updated_at = now()
  where id = p_id and author_id = v_uid and deleted_at is null;

  return query select true, null::text;
end;
$$;
grant execute on function public.update_my_store(bigint, text, text, text, text, numeric, numeric, text, text, text, text, text) to authenticated;

-- 3) soft delete RPC
drop function if exists public.delete_my_store(bigint);
create or replace function public.delete_my_store(p_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;

  select author_id into v_author from public.my_stores
    where id = p_id and deleted_at is null;
  if v_author is null then return query select false, '가게를 찾을 수 없어요'::text; return; end if;
  if v_author <> v_uid then return query select false, '본인 가게만 삭제 가능'::text; return; end if;

  update public.my_stores
    set deleted_at = now(), updated_at = now()
    where id = p_id and author_id = v_uid;

  return query select true, null::text;
end;
$$;
grant execute on function public.delete_my_store(bigint) to authenticated;

notify pgrst, 'reload schema';
