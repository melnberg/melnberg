-- ──────────────────────────────────────────────
-- 127: accept_offer 버그 픽스
-- 067 의 v_owner (uuid) 변수에 status (text 'pending') 를 SELECT INTO 한 부분이
-- "invalid input syntax for type uuid: 'pending'" 런타임 에러 발생 → 매수요청 수락 불가.
-- 변경: v_status text 변수 별도 선언, status 는 거기에 저장.
-- ──────────────────────────────────────────────

create or replace function public.accept_offer(p_offer_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_apt_id bigint;
  v_buyer uuid;
  v_seller uuid;
  v_price numeric;
  v_kind text;
  v_status text;
  v_owner uuid;
  v_buyer_balance numeric;
  v_seller_name text;
  v_buyer_name text;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;

  select apt_id, buyer_id, seller_id, price, kind, status
    into v_apt_id, v_buyer, v_seller, v_price, v_kind, v_status
    from public.apt_listing_offers where id = p_offer_id for update;

  if v_apt_id is null then return query select false, '호가를 찾을 수 없어요'::text; return; end if;
  if v_status <> 'pending' then
    return query select false, '이미 처리된 호가입니다'::text; return;
  end if;

  -- 현재 점거인 = 호출자 검증
  select occupier_id into v_owner from public.apt_master where id = v_apt_id for update;
  if v_owner is null or v_owner <> v_uid then
    return query select false, '본인 보유 단지의 호가만 수락 가능'::text; return;
  end if;
  if v_seller <> v_uid then
    update public.apt_listing_offers set status = 'superseded', resolved_at = now() where id = p_offer_id;
    return query select false, '호가 등록 이후 점거인이 바뀌어 호가가 무효화됐어요'::text; return;
  end if;

  -- 매수자 잔액 재검증 (offer 만)
  if v_kind = 'offer' then
    select coalesce(mlbg_balance, 0) into v_buyer_balance from public.profiles where id = v_buyer for update;
    if v_buyer_balance < v_price then
      update public.apt_listing_offers set status = 'rejected', resolved_at = now() where id = p_offer_id;
      return query select false, ('매수자 잔액 부족 — 호가 자동 거절')::text; return;
    end if;
  end if;

  -- 거래 실행 (atomic)
  if v_kind = 'offer' and v_price > 0 then
    update public.profiles set mlbg_balance = mlbg_balance - v_price where id = v_buyer;
    update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_price where id = v_seller;
  end if;
  -- snatch: 가격 이동 없음. 점거만 이전.

  update public.apt_master set occupier_id = v_buyer, occupied_at = now() where id = v_apt_id;
  delete from public.apt_listings where apt_id = v_apt_id;

  -- 같은 단지의 다른 pending 호가 모두 superseded
  update public.apt_listing_offers
    set status = 'superseded', resolved_at = now()
    where apt_id = v_apt_id and status = 'pending' and id <> p_offer_id;

  -- 이 호가 accepted
  update public.apt_listing_offers set status = 'accepted', resolved_at = now() where id = p_offer_id;

  -- 이벤트 기록
  select display_name into v_seller_name from public.profiles where id = v_seller;
  select display_name into v_buyer_name from public.profiles where id = v_buyer;
  insert into public.apt_occupier_events(
    apt_id, event, actor_id, actor_name, prev_occupier_id, prev_occupier_name, actor_score, prev_score
  ) values (
    v_apt_id, 'sell', v_buyer, v_buyer_name, v_seller, v_seller_name, v_price, v_price
  );

  return query select true, null::text;
end;
$$;
grant execute on function public.accept_offer(bigint) to authenticated;

notify pgrst, 'reload schema';
