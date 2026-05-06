-- ──────────────────────────────────────────────
-- 108: 파업 (strike) — 비주거용 자산 (factory/emart) 점거자에게 % 손실 부여
-- 어드민이 여러 자산 일괄 선택 + % 입력 → 각 점거자 잔액에서 그 % 만큼 차감.
-- 피드·텔레그램 알림 노출.
-- ──────────────────────────────────────────────

-- 1) 자산별 기본 파업 % 컬럼
alter table public.factory_locations
  add column if not exists strike_default_pct numeric not null default 10;
alter table public.emart_locations
  add column if not exists strike_default_pct numeric not null default 10;

-- 2) 파업 이벤트 로그 (loss_pct + 실제 차감 mlbg)
create table if not exists public.strike_events (
  id bigserial primary key,
  asset_type text not null check (asset_type in ('factory', 'emart')),
  asset_id bigint not null,
  occupier_id uuid not null references auth.users(id) on delete cascade,
  loss_pct numeric not null check (loss_pct >= 0),
  loss_mlbg numeric not null check (loss_mlbg >= 0),
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists strike_events_recent_idx
  on public.strike_events(created_at desc);
create index if not exists strike_events_asset_idx
  on public.strike_events(asset_type, asset_id, created_at desc);

alter table public.strike_events enable row level security;
drop policy if exists "strike_events readable by all" on public.strike_events;
create policy "strike_events readable by all"
  on public.strike_events for select using (true);

-- 3) 단일 파업 RPC — % 기반. p_pct NULL 이면 자산의 strike_default_pct 사용.
-- 차감 mlbg = floor(점거자 잔액 * pct / 100). 잔액이 0 이면 0 차감.
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
  v_loss := floor(v_balance * v_pct / 100);
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

-- 4) 자산별 strike_default_pct 변경 RPC (옵션)
create or replace function public.set_strike_default_pct(
  p_asset_type text,
  p_asset_id bigint,
  p_pct numeric
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_uid is null then return query select false, '로그인 필요'::text; return; end if;
  select is_admin into v_is_admin from public.profiles where id = v_uid;
  if not coalesce(v_is_admin, false) then return query select false, '어드민만 가능'::text; return; end if;
  if p_pct < 0 or p_pct > 100 then return query select false, '% 는 0~100'::text; return; end if;
  if p_asset_type = 'factory' then
    update public.factory_locations set strike_default_pct = p_pct where id = p_asset_id;
  elsif p_asset_type = 'emart' then
    update public.emart_locations set strike_default_pct = p_pct where id = p_asset_id;
  else
    return query select false, '자산 타입은 factory/emart 중 하나'::text; return;
  end if;
  return query select true, null::text;
end;
$$;
grant execute on function public.set_strike_default_pct(text, bigint, numeric) to authenticated;

-- 5) 최근 파업 이벤트 (피드 노출용) — 24시간 이내
create or replace function public.list_recent_strikes(p_limit int default 20)
returns table(
  id bigint,
  asset_type text,
  asset_id bigint,
  asset_name text,
  occupier_id uuid,
  occupier_name text,
  loss_pct numeric,
  loss_mlbg numeric,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    s.id, s.asset_type, s.asset_id,
    case s.asset_type
      when 'factory' then fl.name
      when 'emart' then el.name
    end as asset_name,
    s.occupier_id,
    p.display_name,
    s.loss_pct,
    s.loss_mlbg,
    s.created_at
  from public.strike_events s
  left join public.factory_locations fl on s.asset_type = 'factory' and fl.id = s.asset_id
  left join public.emart_locations el on s.asset_type = 'emart' and el.id = s.asset_id
  left join public.profiles p on p.id = s.occupier_id
  where s.created_at > now() - interval '24 hours'
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
grant execute on function public.list_recent_strikes(int) to anon, authenticated;

-- 6) 어드민 파업 페이지용 — 점거된 자산 목록 (factory + emart)
create or replace function public.list_struck_targets()
returns table(
  asset_type text,
  asset_id bigint,
  asset_name text,
  brand_label text,
  occupier_id uuid,
  occupier_name text,
  occupier_balance numeric,
  default_pct numeric
)
language sql stable security definer set search_path = public as $$
  select
    'factory'::text as asset_type,
    f.id, f.name,
    case f.brand
      when 'hynix' then 'SK하이닉스'
      when 'samsung' then '삼성전자'
      when 'costco' then '코스트코'
      when 'union' then '금속노조'
      when 'cargo' then '화물연대'
      when 'terminal' then '터미널'
      when 'station' then '기차역'
      else '시설'
    end as brand_label,
    fo.user_id,
    p.display_name,
    coalesce(p.mlbg_balance, 0)::numeric,
    f.strike_default_pct
  from public.factory_locations f
  inner join public.factory_occupations fo on fo.factory_id = f.id
  left join public.profiles p on p.id = fo.user_id
  union all
  select
    'emart'::text,
    e.id, e.name,
    '이마트'::text,
    eo.user_id,
    p.display_name,
    coalesce(p.mlbg_balance, 0)::numeric,
    e.strike_default_pct
  from public.emart_locations e
  inner join public.emart_occupations eo on eo.emart_id = e.id
  left join public.profiles p on p.id = eo.user_id
  order by 4, 3; -- brand_label, asset_name
$$;
grant execute on function public.list_struck_targets() to authenticated;

notify pgrst, 'reload schema';
