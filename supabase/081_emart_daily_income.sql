-- ──────────────────────────────────────────────
-- 081: 이마트 일일 수익 — 보유자가 매일 1 mlbg 자동 수익
-- last_claimed_at 컬럼 추가 + claim_emart_income RPC
-- 보유자가 청구 시 occupied_at(또는 마지막 청구 시각) 부터 경과 일수 × 1 mlbg 지급
-- ──────────────────────────────────────────────

alter table public.emart_occupations
  add column if not exists last_claimed_at timestamptz;

-- 점거 시 last_claimed_at 을 occupied_at 으로 초기화 (NULL 인 기존 행)
update public.emart_occupations set last_claimed_at = occupied_at where last_claimed_at is null;

-- 청구 RPC — 보유자만, 경과 일수 × 1 mlbg 지급
-- 동일 일자 내 중복 청구 막음 (last_claimed_at 갱신 시 floor(diff_days) 단위)
create or replace function public.claim_emart_income()
returns table(out_success boolean, out_earned numeric, out_message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_occ record;
  v_now timestamptz := now();
  v_days int;
  v_earned numeric;
begin
  if v_uid is null then
    return query select false, 0::numeric, '로그인이 필요해요'::text; return;
  end if;
  select * into v_occ from public.emart_occupations where user_id = v_uid for update;
  if v_occ.id is null then
    return query select false, 0::numeric, '보유 중인 이마트가 없어요'::text; return;
  end if;

  -- KST 기준 일자 차이
  v_days := floor(extract(epoch from (v_now - coalesce(v_occ.last_claimed_at, v_occ.occupied_at))) / 86400)::int;
  if v_days < 1 then
    return query select false, 0::numeric, '아직 하루가 안 지났어요. 24시간마다 청구 가능.'::text; return;
  end if;
  v_earned := v_days * 1.0;

  update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_earned where id = v_uid;
  update public.emart_occupations
    set last_claimed_at = coalesce(last_claimed_at, occupied_at) + (v_days || ' days')::interval
    where id = v_occ.id;

  return query select true, v_earned, null::text;
end;
$$;
grant execute on function public.claim_emart_income() to authenticated;

-- list_emart_with_occupation 도 last_claimed_at 노출하도록 확장
create or replace function public.list_emart_with_occupation()
returns table(
  id bigint,
  kakao_place_id text,
  name text,
  address text,
  lat double precision,
  lng double precision,
  occupier_id uuid,
  occupier_name text,
  occupied_at timestamptz,
  last_claimed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.kakao_place_id, e.name, e.address, e.lat, e.lng,
    o.user_id as occupier_id,
    p.display_name as occupier_name,
    o.occupied_at,
    o.last_claimed_at
  from public.emart_locations e
  left join public.emart_occupations o on o.emart_id = e.id
  left join public.profiles p on p.id = o.user_id;
$$;
grant execute on function public.list_emart_with_occupation() to anon, authenticated;

comment on function public.claim_emart_income is '이마트 보유자 일일 수익 청구. 보유 후 24시간마다 1 mlbg.';
