-- ──────────────────────────────────────────────
-- 025: 점거 스코어 + 강제집행
-- 규칙:
--   1) 점거인 없음 → 점거하기 (claim_apt)
--   2) 다른 사람 점거중 → 강제집행 (force_evict_apt). 내 score > 점거인 score 일 때만 작동.
--   3) score = 작성글 1점 + 댓글 0.7점
--   4) 점거 시 본인 기존 점거 자동 해제 (1인 1점거)
-- ──────────────────────────────────────────────

-- 1) 사용자 score 계산 함수
create or replace function public.get_user_score(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select count(*) from public.apt_discussions where author_id = p_user_id and deleted_at is null), 0)::numeric * 1.0
    + coalesce((select count(*) from public.apt_discussion_comments where author_id = p_user_id and deleted_at is null), 0)::numeric * 0.7;
$$;

grant execute on function public.get_user_score(uuid) to anon, authenticated;

-- 2) claim_apt 업데이트 — 다른 사람이 점거중이면 reject (강제집행은 별도)
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
begin
  if v_uid is null then
    return query select false, null::uuid, null::text, 0::numeric, '로그인이 필요해요'::text;
    return;
  end if;
  select am.occupier_id into v_existing_occ from public.apt_master am where am.id = p_apt_id;
  if v_existing_occ is not null and v_existing_occ <> v_uid then
    select display_name into v_name from public.profiles where id = v_existing_occ;
    v_score := public.get_user_score(v_existing_occ);
    return query select false, v_existing_occ, v_name, v_score, ('이미 ' || coalesce(v_name, '다른 사용자') || ' 님이 점거중 (score ' || v_score || ')')::text;
    return;
  end if;
  if v_existing_occ = v_uid then
    select display_name into v_name from public.profiles where id = v_uid;
    return query select true, v_uid, v_name, public.get_user_score(v_uid), '이미 점거중'::text;
    return;
  end if;
  -- 본인 기존 점거 자동 해제
  update public.apt_master am set occupier_id = null, occupied_at = null
    where am.occupier_id = v_uid and am.id <> p_apt_id;
  -- 점거
  update public.apt_master am set occupier_id = v_uid, occupied_at = now() where am.id = p_apt_id;
  select display_name into v_name from public.profiles where id = v_uid;
  return query select true, v_uid, v_name, public.get_user_score(v_uid), null::text;
end;
$$;

grant execute on function public.claim_apt(bigint) to authenticated;

-- 3) 강제집행 RPC — score > 점거인 score 일 때만 작동
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
begin
  if v_uid is null then
    return query select false, null::uuid, null::text, 0::numeric, 0::numeric, '로그인이 필요해요'::text;
    return;
  end if;
  select am.occupier_id into v_existing_occ from public.apt_master am where am.id = p_apt_id;
  if v_existing_occ is null then
    return query select false, null::uuid, null::text, 0::numeric, 0::numeric, '점거인이 없는 단지입니다 (그냥 점거하세요)'::text;
    return;
  end if;
  if v_existing_occ = v_uid then
    return query select false, v_uid, null::text, 0::numeric, 0::numeric, '본인이 점거중인 단지입니다'::text;
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
  -- 본인 기존 점거 자동 해제
  update public.apt_master am set occupier_id = null, occupied_at = null
    where am.occupier_id = v_uid and am.id <> p_apt_id;
  -- 강제집행
  update public.apt_master am set occupier_id = v_uid, occupied_at = now() where am.id = p_apt_id;
  select display_name into v_name from public.profiles where id = v_uid;
  return query select true, v_uid, v_name, v_my_score, v_my_score, null::text;
end;
$$;

grant execute on function public.force_evict_apt(bigint) to authenticated;

comment on function public.get_user_score is '사용자 활동 점수 — 글 1점 + 댓글 0.7점.';
comment on function public.claim_apt is '점거. 빈 단지만 점거 가능. 본인 기존 점거 자동 해제.';
comment on function public.force_evict_apt is '강제집행. 점거중인 단지를 score 우위로 탈환.';
