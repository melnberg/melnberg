-- ──────────────────────────────────────────────
-- 029: 정회원 자동 매칭 — 네이버ID + 닉네임 둘 다 일치할 때만
-- 보안 강화: 네이버ID만 알면 도용 가능 → 닉네임도 함께 검증
-- ──────────────────────────────────────────────

-- 1) 가입 트리거 — 둘 다 일치할 때만 paid
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_naver_id text := nullif(new.raw_user_meta_data->>'naver_id', '');
  v_display_name text := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
  v_is_paid boolean := false;
begin
  if v_naver_id is not null then
    select true into v_is_paid
    from public.cafe_paid_members
    where naver_id = v_naver_id
      and cafe_nickname = v_display_name;
  end if;

  insert into public.profiles (id, display_name, naver_id, tier, tier_expires_at)
  values (
    new.id,
    v_display_name,
    v_naver_id,
    case when v_is_paid then 'paid' else 'free' end,
    case when v_is_paid then '2099-12-31'::timestamptz else null end
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    naver_id = coalesce(excluded.naver_id, public.profiles.naver_id),
    tier = case when v_is_paid then 'paid' else public.profiles.tier end,
    tier_expires_at = case when v_is_paid then '2099-12-31'::timestamptz else public.profiles.tier_expires_at end;
  return new;
end;
$$;

-- 2) sync_cafe_paid_tier — 네이버ID + 닉네임 둘 다 일치
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
          where c.naver_id = p.naver_id and c.cafe_nickname = p.display_name
        )
      returning 1
  )
  select count(*) into v_count from matched;
  return v_count;
end;
$$;

-- 3) cafe_paid_members 추가 시 자동 매칭 — 닉네임도 일치하는 회원만
create or replace function public.auto_paid_on_cafe_member_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.naver_id is null or new.naver_id = '' or new.cafe_nickname is null then
    return new;
  end if;
  update public.profiles
    set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
    where naver_id = new.naver_id
      and display_name = new.cafe_nickname
      and tier <> 'paid';
  return new;
end;
$$;

comment on function public.handle_new_user is '가입 시 profiles 생성. 네이버ID+닉네임 카페 명부 매칭 시 자동 정회원.';
comment on function public.sync_cafe_paid_tier is '기존 가입자 일괄 정회원 전환 — 네이버ID+닉네임 둘 다 일치 시.';
comment on function public.auto_paid_on_cafe_member_add is '카페 명부 추가 즉시 자동 매칭 — 네이버ID+닉네임 둘 다 일치하는 가입자만 정회원.';
