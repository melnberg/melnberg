-- ──────────────────────────────────────────────
-- 078: 경매 안티스나이프 연장 시간 5분 → 3분
-- ──────────────────────────────────────────────

create or replace function public.place_auction_bid(p_auction_id bigint, p_amount numeric)
returns table(out_success boolean, out_message text, out_new_ends_at timestamptz, out_extended boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_auction record;
  v_balance numeric;
  v_new_ends timestamptz;
  v_extended boolean := false;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text, null::timestamptz, false; return;
  end if;
  if p_amount is null or p_amount <= 0 then
    return query select false, '입찰 금액이 잘못되었어요'::text, null::timestamptz, false; return;
  end if;

  select * into v_auction from public.apt_auctions where id = p_auction_id for update;
  if v_auction.id is null then
    return query select false, '경매를 찾을 수 없어요'::text, null::timestamptz, false; return;
  end if;
  if v_auction.status <> 'active' then
    return query select false, '이미 종료된 경매예요'::text, null::timestamptz, false; return;
  end if;
  if now() >= v_auction.ends_at then
    return query select false, '경매 시간이 만료됐어요'::text, null::timestamptz, false; return;
  end if;
  if now() < v_auction.starts_at then
    return query select false, '아직 시작 전이에요'::text, null::timestamptz, false; return;
  end if;

  if p_amount < v_auction.min_bid then
    return query select false, ('최소 입찰가 ' || v_auction.min_bid || ' mlbg 이상')::text, null::timestamptz, false; return;
  end if;
  if v_auction.current_bid is not null and p_amount <= v_auction.current_bid then
    return query select false, ('현재 최고가 ' || v_auction.current_bid || ' mlbg 보다 높여야 해요')::text, null::timestamptz, false; return;
  end if;

  select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid;
  if v_balance < p_amount then
    return query select false, ('mlbg 부족 — 현재 ' || v_balance || ', 입찰 ' || p_amount)::text, null::timestamptz, false; return;
  end if;

  -- 안티스나이프: 종료 3분 전 입찰 → +3분 연장 (5분 → 3분 변경)
  v_new_ends := v_auction.ends_at;
  if v_auction.ends_at - now() < interval '3 minutes' then
    v_new_ends := now() + interval '3 minutes';
    v_extended := true;
  end if;

  insert into public.auction_bids (auction_id, bidder_id, amount)
    values (p_auction_id, v_uid, p_amount);

  update public.apt_auctions
    set current_bid = p_amount,
        current_bidder_id = v_uid,
        bid_count = bid_count + 1,
        ends_at = v_new_ends
    where id = p_auction_id;

  return query select true, null::text, v_new_ends, v_extended;
end;
$$;

grant execute on function public.place_auction_bid(bigint, numeric) to authenticated;
