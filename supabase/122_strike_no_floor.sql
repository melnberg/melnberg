-- ──────────────────────────────────────────────
-- 122: 파업 손실액 floor 제거 — 잔액 < 10 일 때 0 mlbg 삭감되던 버그 픽스
-- 108 의 v_loss := floor(v_balance * v_pct / 100) 은 잔액 5, 10% 면 0.5 → floor → 0.
-- mlbg_balance 가 numeric 이라 소수 차감 OK. floor 빼고 raw numeric 사용.
-- ──────────────────────────────────────────────

create or replace function public.strike_asset(
  p_asset_type text,
  p_asset_id bigint,
  p_pct numeric default null
)
returns table(
  out_success boolean,
  out_loss_pct numeric,
  out_loss_mlbg numeric,
  out_occupier_id uuid,
  out_occupier_name text,
  out_event_id bigint,
  out_message text
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_occupier uuid;
  v_default_pct numeric;
  v_pct numeric;
  v_balance numeric;
  v_loss numeric;
  v_name text;
  v_event_id bigint;
begin
  if v_uid is null then
    return query select false, 0::numeric, 0::numeric, null::uuid, null::text, null::bigint, '로그인 필요'::text; return;
  end if;
  select is_admin into v_is_admin from public.profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then
    return query select false, 0::numeric, 0::numeric, null::uuid, null::text, null::bigint, '어드민만 파업 가능'::text; return;
  end if;
  if p_asset_type not in ('factory', 'emart') then
    return query select false, 0::numeric, 0::numeric, null::uuid, null::text, null::bigint, '자산 타입은 factory/emart 중 하나'::text; return;
  end if;

  if p_asset_type = 'factory' then
    select occupier.user_id, loc.strike_default_pct
      into v_occupier, v_default_pct
      from public.factory_locations loc
      left join public.factory_occupations occupier on occupier.factory_id = loc.id
      where loc.id = p_asset_id;
  else
    select occupier.user_id, loc.strike_default_pct
      into v_occupier, v_default_pct
      from public.emart_locations loc
      left join public.emart_occupations occupier on occupier.emart_id = loc.id
      where loc.id = p_asset_id;
  end if;

  if v_default_pct is null then
    return query select false, 0::numeric, 0::numeric, null::uuid, null::text, null::bigint, '존재하지 않는 자산'::text; return;
  end if;
  if v_occupier is null then
    return query select false, 0::numeric, 0::numeric, null::uuid, null::text, null::bigint, '점거자 없음'::text; return;
  end if;

  v_pct := coalesce(p_pct, v_default_pct);
  if v_pct < 0 or v_pct > 100 then
    return query select false, 0::numeric, 0::numeric, null::uuid, null::text, null::bigint, '% 는 0~100'::text; return;
  end if;

  select coalesce(mlbg_balance, 0) into v_balance
    from public.profiles where id = v_occupier for update;
  -- floor 제거 — 소수 그대로 차감 (numeric 타입). 정밀도는 소수 둘째자리에서 round 로 안정화.
  v_loss := round(v_balance * v_pct / 100, 2);
  if v_loss < 0 then v_loss := 0; end if;
  if v_loss > v_balance then v_loss := v_balance; end if;

  update public.profiles set mlbg_balance = mlbg_balance - v_loss
    where id = v_occupier;

  insert into public.strike_events (asset_type, asset_id, occupier_id, loss_pct, loss_mlbg, created_by)
    values (p_asset_type, p_asset_id, v_occupier, v_pct, v_loss, v_uid)
    returning id into v_event_id;

  select display_name into v_name from public.profiles where id = v_occupier;
  return query select true, v_pct, v_loss, v_occupier, v_name, v_event_id, null::text;
end;
$$;
grant execute on function public.strike_asset(text, bigint, numeric) to authenticated;

notify pgrst, 'reload schema';
