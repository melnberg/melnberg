-- ──────────────────────────────────────────────
-- 079: 시한 경매 — 어드민이 시작 시각 예약 가능 (기본은 즉시)
-- ──────────────────────────────────────────────

-- p_starts_at NULL 이면 즉시 시작, 값 있으면 그 시각부터 진행.
-- ends_at = starts_at + duration_minutes.
drop function if exists public.create_auction(bigint, int, numeric);
create or replace function public.create_auction(
  p_apt_id bigint,
  p_duration_minutes int,
  p_min_bid numeric,
  p_starts_at timestamptz default null
)
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
  v_starts timestamptz;
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

  v_starts := coalesce(p_starts_at, now());
  -- 너무 과거면 즉시 시작으로 보정 (1분 이상 과거는 그대로 두고 그냥 시작)
  if v_starts < now() - interval '1 minute' then
    v_starts := now();
  end if;
  -- 너무 먼 미래 (30일+) 차단
  if v_starts > now() + interval '30 days' then
    return query select false, null::bigint, '시작 시각은 30일 이내'::text; return;
  end if;

  select occupier_id, apt_nm into v_occupier, v_apt_nm from public.apt_master where id = p_apt_id;
  if v_apt_nm is null then
    return query select false, null::bigint, '존재하지 않는 단지'::text; return;
  end if;
  if v_occupier is not null then
    return query select false, null::bigint, ('이미 점거된 단지: ' || v_apt_nm)::text; return;
  end if;
  -- 같은 단지 진행중 또는 예정 경매 중복 차단
  select count(*) into v_existing_active
    from public.apt_auctions
    where apt_id = p_apt_id and status = 'active';
  if v_existing_active > 0 then
    return query select false, null::bigint, ('이미 진행 중인 경매가 있는 단지: ' || v_apt_nm)::text; return;
  end if;

  insert into public.apt_auctions (apt_id, starts_at, ends_at, min_bid, created_by)
    values (p_apt_id, v_starts, v_starts + (p_duration_minutes || ' minutes')::interval, p_min_bid, v_uid)
    returning id into v_id;
  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.create_auction(bigint, int, numeric, timestamptz) to authenticated;

comment on function public.create_auction is '어드민용 경매 생성. p_starts_at NULL=즉시, 값=예약. 점거된 단지·중복 active 차단.';
