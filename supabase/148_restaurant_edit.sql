-- ──────────────────────────────────────────────
-- 148: 맛집 핀 수정 RPC — 등록자 본인만 (좌표는 변경 불가, 사진/설명/메뉴/이름만)
-- ──────────────────────────────────────────────

create or replace function public.update_restaurant_pin(
  p_pin_id bigint,
  p_name text default null,
  p_description text default null,
  p_recommended_menu text default null,
  p_photo_url text default null
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pin record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select * into v_pin from public.restaurant_pins where id = p_pin_id and deleted_at is null;
  if v_pin.id is null then return query select false, '핀을 찾을 수 없어요'::text; return; end if;
  if v_pin.author_id <> v_uid then return query select false, '본인이 등록한 핀만 수정 가능해요'::text; return; end if;

  -- 검증: 비어있는 필드는 그대로 (null 무시)
  if p_name is not null and length(trim(p_name)) = 0 then return query select false, '가게명이 비어있어요'::text; return; end if;
  if p_description is not null and length(trim(p_description)) = 0 then return query select false, '설명이 비어있어요'::text; return; end if;
  if p_recommended_menu is not null and length(trim(p_recommended_menu)) = 0 then return query select false, '추천메뉴가 비어있어요'::text; return; end if;
  if p_photo_url is not null and length(trim(p_photo_url)) = 0 then return query select false, '사진 URL 이 비어있어요'::text; return; end if;

  update public.restaurant_pins
    set
      name = coalesce(nullif(trim(p_name), ''), name),
      description = coalesce(nullif(trim(p_description), ''), description),
      recommended_menu = coalesce(nullif(trim(p_recommended_menu), ''), recommended_menu),
      photo_url = coalesce(nullif(trim(p_photo_url), ''), photo_url)
    where id = p_pin_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.update_restaurant_pin(bigint, text, text, text, text) to authenticated;

-- 삭제 (soft) — 등록자 본인만
create or replace function public.delete_restaurant_pin(p_pin_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pin record;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select * into v_pin from public.restaurant_pins where id = p_pin_id and deleted_at is null;
  if v_pin.id is null then return query select false, '핀을 찾을 수 없어요'::text; return; end if;
  if v_pin.author_id <> v_uid then return query select false, '본인 핀만 삭제 가능해요'::text; return; end if;

  update public.restaurant_pins set deleted_at = now() where id = p_pin_id;
  -- 점거자가 있으면 occupations 도 자동 삭제 (cascade)
  delete from public.restaurant_pin_occupations where pin_id = p_pin_id;
  delete from public.restaurant_pin_listings where pin_id = p_pin_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.delete_restaurant_pin(bigint) to authenticated;

notify pgrst, 'reload schema';
