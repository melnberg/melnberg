-- ──────────────────────────────────────────────
-- 200: 같은 장소에 다른 이름 가게 등록 가능 — 좌표+이름 둘 다 같을 때만 중복 처리
-- 145 의 register_restaurant_pin 의 좌표 중복 체크 (±0.0003) 에 name 일치 조건 추가.
-- → 같은 좌표라도 가게 이름이 다르면 등록 가능 (한 건물에 2~3 가게 케이스 지원).
-- ──────────────────────────────────────────────

drop function if exists public.register_restaurant_pin(text, text, text, numeric, numeric, text, text, text);
create or replace function public.register_restaurant_pin(
  p_name text, p_description text, p_recommended_menu text,
  p_lat numeric, p_lng numeric, p_photo_url text default null,
  p_address text default null, p_dong text default null
)
returns table(out_success boolean, out_id bigint, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_id bigint;
  v_dup int;
begin
  if v_uid is null then return query select false, null::bigint, '로그인이 필요해요'::text; return; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then return query select false, null::bigint, '가게명을 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_description, ''))) = 0 then return query select false, null::bigint, '설명을 입력하세요'::text; return; end if;
  if length(trim(coalesce(p_recommended_menu, ''))) = 0 then return query select false, null::bigint, '추천메뉴를 입력하세요'::text; return; end if;
  if p_lat is null or p_lng is null then return query select false, null::bigint, '좌표가 필요해요'::text; return; end if;

  select count(*) into v_count from public.restaurant_pins
    where author_id = v_uid and deleted_at is null;
  if v_count >= 5 then
    return query select false, null::bigint, '1인당 최대 5개까지 등록 가능 (현재 ' || v_count || '개)'::text; return;
  end if;

  -- 좌표 + 이름 둘 다 같을 때만 중복 처리 (한 건물 여러 가게 허용)
  select count(*) into v_dup from public.restaurant_pins
    where author_id = v_uid and deleted_at is null
      and abs(lat - p_lat) < 0.0003 and abs(lng - p_lng) < 0.0003
      and lower(trim(name)) = lower(trim(p_name));
  if v_dup > 0 then
    return query select false, null::bigint, '같은 위치에 같은 이름의 가게가 이미 있어요'::text; return;
  end if;

  insert into public.restaurant_pins (author_id, name, description, recommended_menu, lat, lng, photo_url, address, dong)
    values (v_uid, trim(p_name), trim(p_description), trim(p_recommended_menu), p_lat, p_lng,
            nullif(trim(coalesce(p_photo_url, '')), ''), nullif(trim(coalesce(p_address, '')), ''),
            nullif(trim(coalesce(p_dong, '')), ''))
    returning id into v_id;

  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + 30 where id = v_uid;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.register_restaurant_pin(text, text, text, numeric, numeric, text, text, text) to authenticated;

notify pgrst, 'reload schema';
