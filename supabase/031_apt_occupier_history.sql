-- ──────────────────────────────────────────────
-- 031: 점거 히스토리 (이벤트 로그)
-- 이벤트 종류:
--   'claim'  — 빈 단지를 점거 (actor 만)
--   'evict'  — 강제집행 (actor 가 prev 를 쫓아냄)
--   'vacate' — 자진 이사 (다른 단지 점거하면서 자동, prev 만)
-- ──────────────────────────────────────────────

create table if not exists public.apt_occupier_events (
  id bigserial primary key,
  apt_id bigint not null references public.apt_master(id) on delete cascade,
  event text not null check (event in ('claim','evict','vacate')),
  actor_id uuid,            -- 행위자 (claim/evict 의 새 점거인, vacate 시 떠나는 사람)
  actor_name text,          -- 닉네임 스냅샷
  prev_occupier_id uuid,    -- evict 시 쫓겨난 사람
  prev_occupier_name text,
  actor_score numeric,      -- 사건 시점 score
  prev_score numeric,
  occurred_at timestamptz not null default now()
);

create index if not exists apt_occupier_events_apt_id_idx
  on public.apt_occupier_events(apt_id, occurred_at desc);

alter table public.apt_occupier_events enable row level security;

drop policy if exists "occupier events readable by all" on public.apt_occupier_events;
create policy "occupier events readable by all"
  on public.apt_occupier_events for select using (true);

-- claim_apt 재정의 — 이벤트 기록 추가
drop function if exists public.claim_apt(bigint);
create or replace function public.claim_apt(p_apt_id bigint)
returns table(
  out_success boolean,
  out_occupier_id uuid,
  out_occupier_name text,
  out_occupier_score numeric,
  out_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_occ uuid;
  v_name text;
  v_score numeric;
  v_prev_apt_id bigint;
begin
  if v_uid is null then
    return query select false, null::uuid, null::text, 0::numeric, '로그인이 필요해요'::text;
    return;
  end if;

  select am.occupier_id into v_existing_occ from public.apt_master am where am.id = p_apt_id;

  if v_existing_occ is not null and v_existing_occ <> v_uid then
    select display_name into v_name from public.profiles where id = v_existing_occ;
    v_score := public.get_user_score(v_existing_occ);
    return query select false, v_existing_occ, v_name, v_score,
      ('이미 ' || coalesce(v_name, '다른 사용자') || ' 님이 점거중 (score ' || v_score || ')')::text;
    return;
  end if;

  if v_existing_occ = v_uid then
    select display_name into v_name from public.profiles where id = v_uid;
    return query select true, v_uid, v_name, public.get_user_score(v_uid), '이미 점거중'::text;
    return;
  end if;

  -- 본인 기존 점거 자동 해제 + vacate 이벤트
  select id into v_prev_apt_id from public.apt_master where occupier_id = v_uid and id <> p_apt_id limit 1;
  if v_prev_apt_id is not null then
    select display_name into v_name from public.profiles where id = v_uid;
    v_score := public.get_user_score(v_uid);
    update public.apt_master set occupier_id = null, occupied_at = null where id = v_prev_apt_id;
    insert into public.apt_occupier_events(apt_id, event, actor_id, actor_name, actor_score)
      values (v_prev_apt_id, 'vacate', v_uid, v_name, v_score);
  end if;

  -- 점거 + claim 이벤트
  update public.apt_master set occupier_id = v_uid, occupied_at = now() where id = p_apt_id;
  select display_name into v_name from public.profiles where id = v_uid;
  v_score := public.get_user_score(v_uid);
  insert into public.apt_occupier_events(apt_id, event, actor_id, actor_name, actor_score)
    values (p_apt_id, 'claim', v_uid, v_name, v_score);

  return query select true, v_uid, v_name, v_score, null::text;
end;
$$;

grant execute on function public.claim_apt(bigint) to authenticated;

-- force_evict_apt 재정의 — evict 이벤트 + vacate 이벤트 (본인 기존 단지)
drop function if exists public.force_evict_apt(bigint);
create or replace function public.force_evict_apt(p_apt_id bigint)
returns table(
  out_success boolean,
  out_occupier_id uuid,
  out_occupier_name text,
  out_occupier_score numeric,
  out_my_score numeric,
  out_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_occ uuid;
  v_their_score numeric;
  v_my_score numeric;
  v_name text;
  v_their_name text;
  v_prev_apt_id bigint;
begin
  if v_uid is null then
    return query select false, null::uuid, null::text, 0::numeric, 0::numeric, '로그인이 필요해요'::text;
    return;
  end if;

  select am.occupier_id into v_existing_occ from public.apt_master am where am.id = p_apt_id;

  if v_existing_occ is null then
    return query select false, null::uuid, null::text, 0::numeric, 0::numeric,
      '점거인이 없는 단지입니다 (그냥 점거하세요)'::text;
    return;
  end if;

  if v_existing_occ = v_uid then
    return query select false, v_uid, null::text, 0::numeric, 0::numeric,
      '본인이 점거중인 단지입니다'::text;
    return;
  end if;

  v_my_score := public.get_user_score(v_uid);
  v_their_score := public.get_user_score(v_existing_occ);
  select display_name into v_their_name from public.profiles where id = v_existing_occ;

  if v_my_score <= v_their_score then
    return query select false, v_existing_occ, v_their_name, v_their_score, v_my_score,
      ('점수 부족 — 내 ' || v_my_score || ' / 점거인 ' || v_their_score)::text;
    return;
  end if;

  -- 본인 기존 점거 자동 해제 + vacate
  select id into v_prev_apt_id from public.apt_master where occupier_id = v_uid and id <> p_apt_id limit 1;
  if v_prev_apt_id is not null then
    select display_name into v_name from public.profiles where id = v_uid;
    update public.apt_master set occupier_id = null, occupied_at = null where id = v_prev_apt_id;
    insert into public.apt_occupier_events(apt_id, event, actor_id, actor_name, actor_score)
      values (v_prev_apt_id, 'vacate', v_uid, v_name, v_my_score);
  end if;

  -- 강제집행 + evict 이벤트
  update public.apt_master set occupier_id = v_uid, occupied_at = now() where id = p_apt_id;
  select display_name into v_name from public.profiles where id = v_uid;
  insert into public.apt_occupier_events(
    apt_id, event,
    actor_id, actor_name, actor_score,
    prev_occupier_id, prev_occupier_name, prev_score
  ) values (
    p_apt_id, 'evict',
    v_uid, v_name, v_my_score,
    v_existing_occ, v_their_name, v_their_score
  );

  return query select true, v_uid, v_name, v_my_score, v_my_score, null::text;
end;
$$;

grant execute on function public.force_evict_apt(bigint) to authenticated;

-- 히스토리 조회 RPC (시간 오름차순)
create or replace function public.get_apt_history(p_apt_id bigint)
returns table(
  occurred_at timestamptz,
  event text,
  actor_name text,
  prev_occupier_name text,
  actor_score numeric,
  prev_score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select occurred_at, event, actor_name, prev_occupier_name, actor_score, prev_score
  from public.apt_occupier_events
  where apt_id = p_apt_id
  order by occurred_at asc;
$$;

grant execute on function public.get_apt_history(bigint) to anon, authenticated;

comment on table public.apt_occupier_events is '단지별 점거 변동 이벤트 로그.';
comment on function public.get_apt_history is '단지 점거 히스토리 (오래된 순).';
