-- ──────────────────────────────────────────────
-- 208: 정회원 매칭 일관성 — 모든 트리거에 lower(trim()) 통일
--
-- 사고 패턴 (재발):
--   가입한 회원이 카페 명부에 있는데도 정회원 인식 안 됨.
--   원인: 매칭 트리거마다 비교 기준이 다 다름.
--     - 028→033: trim O, lower X, **cafe_nickname=display_name strict**
--     - 043 handle_new_user: trim O, lower X, **cafe_nickname=display_name strict**
--     - 063 auto_paid_on_profile_naver_id: trim X, lower X
--     - 138 auto_paid_on_profile_display_name: trim O, lower X
--     - 158 recheck_paid_on_profile_update: trim O, lower X
--   → 대소문자 1글자 차이, 닉네임 1글자 차이, 트리거 충돌 등으로 누락 재발.
--
-- 해결:
--   1) 저장값 자체를 lower(trim()) 으로 정규화 (profiles.naver_id, cafe_paid_members.naver_id)
--   2) 모든 매칭 트리거/RPC 를 lower(trim(naver_id)) 단일 기준으로 통일
--      → cafe_nickname=display_name strict 조건 전부 제거 (158 와 동일 정책)
--   3) 일괄 재승급
-- ──────────────────────────────────────────────

-- 1) 저장값 정규화
update public.profiles
  set naver_id = lower(trim(naver_id))
  where naver_id is not null and naver_id <> lower(trim(naver_id));

update public.cafe_paid_members
  set naver_id = lower(trim(naver_id))
  where naver_id <> lower(trim(naver_id));

-- 2-a) handle_new_user — strict 닉네임 매칭 제거, naver_id 만으로 매칭
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_naver_raw text := nullif(trim(new.raw_user_meta_data->>'naver_id'), '');
  v_naver_id text := nullif(lower(split_part(v_naver_raw, '@', 1)), '');
  v_display_name text := trim(coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  v_link_url text := nullif(trim(new.raw_user_meta_data->>'link_url'), '');
  v_phone text := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g'), '');
  v_form_signup boolean := (new.raw_user_meta_data ? 'mlbg_signup');
  v_is_paid boolean := false;
begin
  if v_naver_id is not null then
    select true into v_is_paid
    from public.cafe_paid_members
    where lower(trim(naver_id)) = v_naver_id;
  end if;

  insert into public.profiles (id, display_name, naver_id, link_url, phone, tier, tier_expires_at, profile_completed_at)
  values (
    new.id,
    v_display_name,
    v_naver_id,
    v_link_url,
    v_phone,
    case when v_is_paid then 'paid' else 'free' end,
    case when v_is_paid then '2099-12-31'::timestamptz else null end,
    case when v_form_signup then now() else null end
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    naver_id = coalesce(excluded.naver_id, public.profiles.naver_id),
    link_url = coalesce(excluded.link_url, public.profiles.link_url),
    phone = coalesce(excluded.phone, public.profiles.phone),
    tier = case when v_is_paid then 'paid' else public.profiles.tier end,
    tier_expires_at = case when v_is_paid then '2099-12-31'::timestamptz else public.profiles.tier_expires_at end,
    profile_completed_at = coalesce(public.profiles.profile_completed_at, case when v_form_signup then now() else null end);
  return new;
end;
$$;

comment on function public.handle_new_user is
  '208 — naver_id 단일 매칭 (lower+trim). cafe_nickname=display_name strict 제거.';

-- 2-b) auto_paid_on_cafe_member_add — strict 닉네임 매칭 제거
create or replace function public.auto_paid_on_cafe_member_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.naver_id is null or trim(new.naver_id) = '' then return new; end if;
  update public.profiles
    set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
    where lower(trim(naver_id)) = lower(trim(new.naver_id))
      and tier <> 'paid';
  return new;
end;
$$;

comment on function public.auto_paid_on_cafe_member_add is
  '208 — naver_id 단일 매칭 (lower+trim). cafe_nickname=display_name strict 제거.';

-- 2-c) auto_paid_on_profile_naver_id (063) — lower(trim()) 적용
create or replace function public.auto_paid_on_profile_naver_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.naver_id is null or new.naver_id = '' then return new; end if;
  if new.tier = 'paid' then return new; end if;
  if exists (
    select 1 from public.cafe_paid_members
    where lower(trim(naver_id)) = lower(trim(new.naver_id))
  ) then
    new.tier := 'paid';
    new.tier_expires_at := '2099-12-31'::timestamptz;
  end if;
  return new;
end;
$$;

comment on function public.auto_paid_on_profile_naver_id is
  '208 — lower(trim()) 매칭으로 통일. 대소문자/공백 차이로 누락되던 사고 방지.';

-- 2-d) auto_paid_on_profile_display_name (138) — lower(trim()) 적용
create or replace function public.auto_paid_on_profile_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.naver_id is null or new.naver_id = '' then return new; end if;
  if new.tier = 'paid' then return new; end if;
  if tg_op = 'UPDATE' and new.display_name = old.display_name then return new; end if;
  if exists (
    select 1 from public.cafe_paid_members
    where lower(trim(naver_id)) = lower(trim(new.naver_id))
  ) then
    new.tier := 'paid';
    new.tier_expires_at := '2099-12-31'::timestamptz;
  end if;
  return new;
end;
$$;

comment on function public.auto_paid_on_profile_display_name is
  '208 — lower(trim()) 매칭으로 통일.';

-- 2-e) recheck_paid_on_profile_update (158) — lower(trim()) 적용
create or replace function public.recheck_paid_on_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matched boolean := false;
begin
  if (new.naver_id is not distinct from old.naver_id)
     and (new.display_name is not distinct from old.display_name) then
    return new;
  end if;

  if new.naver_id is not null and trim(new.naver_id) <> '' then
    v_matched := exists (
      select 1 from public.cafe_paid_members c
      where lower(trim(c.naver_id)) = lower(trim(new.naver_id))
    );
  end if;

  if v_matched then
    new.tier := 'paid';
    new.tier_expires_at := '2099-12-31'::timestamptz;
  else
    if new.tier = 'paid'
       and new.tier_expires_at is not null
       and extract(year from new.tier_expires_at) >= 2099 then
      new.tier := 'free';
      new.tier_expires_at := null;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.recheck_paid_on_profile_update is
  '208 — lower(trim()) 매칭으로 통일.';

-- 2-f) sync_cafe_paid_tier (어드민 RPC) — strict 닉네임 제거 + lower(trim())
create or replace function public.sync_cafe_paid_tier()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'admin only';
  end if;
  with matched as (
    update public.profiles p
      set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
      where p.naver_id is not null
        and p.tier <> 'paid'
        and exists (
          select 1 from public.cafe_paid_members c
          where lower(trim(c.naver_id)) = lower(trim(p.naver_id))
        )
      returning 1
  )
  select count(*) into v_count from matched;
  return v_count;
end;
$$;

comment on function public.sync_cafe_paid_tier is
  '208 — lower(trim()) 매칭. 어드민 일괄 동기화 RPC.';

-- 3) 일괄 재승급 — 카페 명부에 있는데 free 인 사용자 전원
update public.profiles p
  set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
  where p.tier <> 'paid'
    and p.naver_id is not null
    and trim(p.naver_id) <> ''
    and exists (
      select 1 from public.cafe_paid_members c
      where lower(trim(c.naver_id)) = lower(trim(p.naver_id))
    );

notify pgrst, 'reload schema';
