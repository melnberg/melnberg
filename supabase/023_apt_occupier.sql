-- ──────────────────────────────────────────────
-- 023: 단지 점거 기능
-- 규칙:
--   1) 점거인 없는 단지만 점거 가능 (선점 우선)
--   2) 1인 1점거 — 새 단지 점거 시 본인의 기존 점거 자동 해제
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

alter table public.apt_master
  add column if not exists occupier_id uuid references auth.users(id) on delete set null,
  add column if not exists occupied_at timestamptz;

create index if not exists apt_master_occupier_idx
  on public.apt_master (occupier_id)
  where occupier_id is not null;

-- 점거 RPC
create or replace function public.claim_apt(p_apt_id bigint)
returns table(success boolean, occupier_id uuid, occupied_at timestamptz, occupier_name text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_occ uuid;
  v_name text;
  v_now timestamptz := now();
begin
  if v_uid is null then
    return query select false, null::uuid, null::timestamptz, null::text, '로그인이 필요해요'::text;
    return;
  end if;
  -- 대상 단지 점거 상태 확인
  select am.occupier_id into v_existing_occ from public.apt_master am where am.id = p_apt_id;
  if v_existing_occ is not null and v_existing_occ <> v_uid then
    select display_name into v_name from public.profiles where id = v_existing_occ;
    return query select false, v_existing_occ, null::timestamptz, v_name, ('이미 ' || coalesce(v_name, '다른 사용자') || ' 님이 점거중')::text;
    return;
  end if;
  -- 본인이 이미 이 단지 점거중이면 변경 없음
  if v_existing_occ = v_uid then
    select display_name into v_name from public.profiles where id = v_uid;
    return query select true, v_uid, v_now, v_name, '이미 점거중'::text;
    return;
  end if;
  -- 본인의 기존 점거 자동 해제 (1인 1점거)
  update public.apt_master set occupier_id = null, occupied_at = null
    where occupier_id = v_uid and id <> p_apt_id;
  -- 대상 단지 점거
  update public.apt_master set occupier_id = v_uid, occupied_at = v_now where id = p_apt_id;
  select display_name into v_name from public.profiles where id = v_uid;
  return query select true, v_uid, v_now, v_name, null::text;
end;
$$;

grant execute on function public.claim_apt(bigint) to authenticated;

comment on function public.claim_apt is '단지 점거. 선점 우선 + 1인 1점거.';
comment on column public.apt_master.occupier_id is '현재 단지 점거인. null이면 미점거.';
