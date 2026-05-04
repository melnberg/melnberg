-- ──────────────────────────────────────────────
-- 035: 점거·강제집행 — 해당 단지에 글 1개 이상 작성 시에만 가능
-- 도배 점거 방지 + 단지에 대한 의견을 남긴 사람만 점거 가능
-- ──────────────────────────────────────────────

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
  v_my_post_count int;
begin
  if v_uid is null then
    return query select false, null::uuid, null::text, 0::numeric, '로그인이 필요해요'::text;
    return;
  end if;

  -- 단지에 글 1개 이상 작성했는지 확인
  select count(*) into v_my_post_count
    from public.apt_discussions
    where apt_master_id = p_apt_id
      and author_id = v_uid
      and deleted_at is null;
  if v_my_post_count = 0 then
    return query select false, null::uuid, null::text, 0::numeric,
      '이 단지에 글을 1개 이상 작성한 후 점거 가능합니다'::text;
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
  v_my_post_count int;
begin
  if v_uid is null then
    return query select false, null::uuid, null::text, 0::numeric, 0::numeric, '로그인이 필요해요'::text;
    return;
  end if;

  -- 단지에 글 1개 이상 작성했는지 확인
  select count(*) into v_my_post_count
    from public.apt_discussions
    where apt_master_id = p_apt_id
      and author_id = v_uid
      and deleted_at is null;
  if v_my_post_count = 0 then
    return query select false, null::uuid, null::text, 0::numeric, 0::numeric,
      '이 단지에 글을 1개 이상 작성한 후 강제집행 가능합니다'::text;
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
