-- ──────────────────────────────────────────────
-- 065: apt_listings 에 description 컬럼 + list_apt_for_sale RPC 확장
-- 매도인이 매물 설명(상태·층수·인테리어 등)을 함께 등록할 수 있도록.
-- ──────────────────────────────────────────────

alter table public.apt_listings
  add column if not exists description text;

comment on column public.apt_listings.description is '매물 설명 (매도인 작성). 1000자 제한 권장.';

-- list_apt_for_sale 시그니처 변경 — p_description 추가 (NULL 허용)
drop function if exists public.list_apt_for_sale(bigint, numeric);
create or replace function public.list_apt_for_sale(p_apt_id bigint, p_price numeric, p_description text default null)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_desc text;
begin
  if v_uid is null then
    return query select false, '로그인이 필요해요'::text; return;
  end if;
  if p_price is null or p_price <= 0 then
    return query select false, '가격은 0보다 커야 해요'::text; return;
  end if;
  select occupier_id into v_owner from public.apt_master where id = p_apt_id;
  if v_owner is null or v_owner <> v_uid then
    return query select false, '본인 보유 단지만 매물로 등록할 수 있어요'::text; return;
  end if;
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  if v_desc is not null and length(v_desc) > 1000 then
    v_desc := left(v_desc, 1000);
  end if;
  insert into public.apt_listings(apt_id, seller_id, price, description)
    values (p_apt_id, v_uid, p_price, v_desc)
    on conflict (apt_id) do update
      set seller_id = excluded.seller_id,
          price = excluded.price,
          description = excluded.description,
          updated_at = now();
  return query select true, null::text;
end;
$$;
grant execute on function public.list_apt_for_sale(bigint, numeric, text) to authenticated;

-- view 도 description 포함 (home-pins 가 사용)
create or replace view public.apt_master_with_listing as
  select am.*, l.price as listing_price, l.listed_at as listed_at, l.description as listing_description
  from public.apt_master am
  left join public.apt_listings l on l.apt_id = am.id;

grant select on public.apt_master_with_listing to anon, authenticated;
