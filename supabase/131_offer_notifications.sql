-- ──────────────────────────────────────────────
-- 131: 매수요청 / 매도수락 알림 + 피드용 컬럼
-- 1) notifications type check 확장 — 'offer_made', 'offer_accepted', 'snatch_made'
-- 2) notifications.listing_offer_id, listing_price, listing_message 컬럼 추가
-- 3) make_offer RPC — 판매자에게 알림 INSERT
-- 4) accept_offer RPC — 매수자에게 수락 알림 INSERT
-- 피드 노출은 별도 (app/page.tsx 가 apt_listing_offers / apt_occupier_events 조회).
-- ──────────────────────────────────────────────

-- 1) type check 확장 — 기존 타입 + 새 호가/수락 타입 모두 포함
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'community_comment','apt_comment','apt_evicted','feedback_reply',
    'admin_notice','bio_comment',
    'offer_made','offer_accepted','snatch_made'
  ));

-- 2) 컬럼 추가 — 매수요청 정보 표시용
alter table public.notifications
  add column if not exists listing_offer_id bigint,
  add column if not exists listing_price numeric,
  add column if not exists listing_message text;

-- 3) make_offer 재정의 — 판매자에게 알림 INSERT
create or replace function public.make_offer(p_apt_id bigint, p_price numeric, p_kind text, p_message text default null)
returns table(out_success boolean, out_id bigint, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_balance numeric;
  v_id bigint;
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
  v_buyer_name text;
  v_apt_nm text;
begin
  if v_uid is null then return query select false, null::bigint, '로그인이 필요해요'::text; return; end if;
  if p_kind not in ('offer', 'snatch') then
    return query select false, null::bigint, 'kind 는 offer 또는 snatch'::text; return;
  end if;

  select occupier_id, apt_nm into v_owner, v_apt_nm from public.apt_master where id = p_apt_id;
  if v_owner is null then
    return query select false, null::bigint, '점거자가 없는 단지에는 호가할 수 없어요'::text; return;
  end if;
  if v_owner = v_uid then
    return query select false, null::bigint, '본인 보유 단지에는 호가할 수 없어요'::text; return;
  end if;

  if p_kind = 'offer' and (p_price is null or p_price <= 0) then
    return query select false, null::bigint, '매수 호가는 0보다 커야 해요'::text; return;
  end if;
  if p_kind = 'snatch' then
    p_price := 0;
  end if;

  if p_kind = 'offer' then
    select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid;
    if v_balance < p_price then
      return query select false, null::bigint,
        ('잔액 부족 — 호가 ' || p_price || ' mlbg / 보유 ' || v_balance || ' mlbg')::text;
      return;
    end if;
  end if;

  if v_msg is not null and length(v_msg) > 500 then v_msg := left(v_msg, 500); end if;

  insert into public.apt_listing_offers(apt_id, buyer_id, seller_id, price, kind, message)
    values (p_apt_id, v_uid, v_owner, p_price, p_kind, v_msg)
    returning id into v_id;

  -- 판매자에게 알림 INSERT
  select display_name into v_buyer_name from public.profiles where id = v_uid;
  begin
    insert into public.notifications (
      recipient_id, type, apt_master_id, actor_id, actor_name,
      listing_offer_id, listing_price, listing_message
    ) values (
      v_owner,
      case when p_kind = 'snatch' then 'snatch_made' else 'offer_made' end,
      p_apt_id, v_uid, v_buyer_name,
      v_id, p_price, v_msg
    );
  exception when others then null; -- 알림 실패해도 호가 자체는 성공
  end;

  return query select true, v_id, null::text;
end;
$$;
grant execute on function public.make_offer(bigint, numeric, text, text) to authenticated;

-- 4) accept_offer — 매수자에게 수락 알림 INSERT (uuid 버그 픽스도 포함, 127 와 동일)
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
  v_apt_nm text;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;

  select apt_id, buyer_id, seller_id, price, kind, status
    into v_apt_id, v_buyer, v_seller, v_price, v_kind, v_status
    from public.apt_listing_offers where id = p_offer_id for update;

  if v_apt_id is null then return query select false, '호가를 찾을 수 없어요'::text; return; end if;
  if v_status <> 'pending' then
    return query select false, '이미 처리된 호가입니다'::text; return;
  end if;

  select occupier_id, apt_nm into v_owner, v_apt_nm from public.apt_master where id = v_apt_id for update;
  if v_owner is null or v_owner <> v_uid then
    return query select false, '본인 보유 단지의 호가만 수락 가능'::text; return;
  end if;
  if v_seller <> v_uid then
    update public.apt_listing_offers set status = 'superseded', resolved_at = now() where id = p_offer_id;
    return query select false, '호가 등록 이후 점거인이 바뀌어 호가가 무효화됐어요'::text; return;
  end if;

  if v_kind = 'offer' then
    select coalesce(mlbg_balance, 0) into v_buyer_balance from public.profiles where id = v_buyer for update;
    if v_buyer_balance < v_price then
      update public.apt_listing_offers set status = 'rejected', resolved_at = now() where id = p_offer_id;
      return query select false, ('매수자 잔액 부족 — 호가 자동 거절')::text; return;
    end if;
  end if;

  if v_kind = 'offer' and v_price > 0 then
    update public.profiles set mlbg_balance = mlbg_balance - v_price where id = v_buyer;
    update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_price where id = v_seller;
  end if;

  update public.apt_master set occupier_id = v_buyer, occupied_at = now() where id = v_apt_id;
  delete from public.apt_listings where apt_id = v_apt_id;

  update public.apt_listing_offers
    set status = 'superseded', resolved_at = now()
    where apt_id = v_apt_id and status = 'pending' and id <> p_offer_id;

  update public.apt_listing_offers set status = 'accepted', resolved_at = now() where id = p_offer_id;

  select display_name into v_seller_name from public.profiles where id = v_seller;
  select display_name into v_buyer_name from public.profiles where id = v_buyer;
  insert into public.apt_occupier_events(
    apt_id, event, actor_id, actor_name, prev_occupier_id, prev_occupier_name, actor_score, prev_score
  ) values (
    v_apt_id, 'sell', v_buyer, v_buyer_name, v_seller, v_seller_name, v_price, v_price
  );

  -- 매수자에게 수락 알림
  begin
    insert into public.notifications (
      recipient_id, type, apt_master_id, actor_id, actor_name,
      listing_offer_id, listing_price
    ) values (
      v_buyer, 'offer_accepted', v_apt_id, v_uid, v_seller_name,
      p_offer_id, v_price
    );
  exception when others then null;
  end;

  return query select true, null::text;
end;
$$;
grant execute on function public.accept_offer(bigint) to authenticated;

notify pgrst, 'reload schema';
