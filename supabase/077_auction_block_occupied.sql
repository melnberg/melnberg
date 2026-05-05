-- ──────────────────────────────────────────────
-- 077: 시한 경매 — 이미 점거된 단지에는 등록 못 하게
-- ──────────────────────────────────────────────

create or replace function public.create_auction(p_apt_id bigint, p_duration_minutes int, p_min_bid numeric)
returns table(out_success boolean, out_auction_id bigint, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_id bigint;
  v_occupier uuid;
  v_apt_nm text;
  v_existing_active int;
begin
  if v_uid is null then
    return query select false, null::bigint, '로그인이 필요해요'::text; return;
  end if;
  select is_admin into v_is_admin from public.profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then
    return query select false, null::bigint, '어드민만 경매 생성 가능'::text; return;
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 1440 then
    return query select false, null::bigint, '진행 시간은 5분~1440분 (24시간) 이내'::text; return;
  end if;
  if p_min_bid is null or p_min_bid <= 0 then
    return query select false, null::bigint, '최소 입찰가가 잘못됨'::text; return;
  end if;

  -- 단지 존재 + 점거 여부 검증
  select occupier_id, apt_nm into v_occupier, v_apt_nm from public.apt_master where id = p_apt_id;
  if v_apt_nm is null then
    return query select false, null::bigint, '존재하지 않는 단지'::text; return;
  end if;
  if v_occupier is not null then
    return query select false, null::bigint, ('이미 점거된 단지: ' || v_apt_nm)::text; return;
  end if;

  -- 같은 단지 진행중 경매 중복 등록 방지
  select count(*) into v_existing_active
    from public.apt_auctions
    where apt_id = p_apt_id and status = 'active';
  if v_existing_active > 0 then
    return query select false, null::bigint, ('이미 진행 중인 경매가 있는 단지: ' || v_apt_nm)::text; return;
  end if;

  insert into public.apt_auctions (apt_id, starts_at, ends_at, min_bid, created_by)
    values (p_apt_id, now(), now() + (p_duration_minutes || ' minutes')::interval, p_min_bid, v_uid)
    returning id into v_id;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.create_auction(bigint, int, numeric) to authenticated;
