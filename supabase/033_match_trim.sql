-- ──────────────────────────────────────────────
-- 033: 정회원 매칭 — 양쪽 trim() 후 비교
-- 가입 폼/카페 명부 어디든 앞뒤 공백이 끼면 매칭 실패하던 문제
-- (예: "디벨로퍼" vs " 디벨로퍼")
-- ──────────────────────────────────────────────

-- 가입 시: trim 비교 + insert 값도 trim
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_naver_id text := nullif(trim(new.raw_user_meta_data->>'naver_id'), '');
  v_display_name text := trim(coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  v_is_paid boolean := false;
begin
  if v_naver_id is not null then
    select true into v_is_paid
    from public.cafe_paid_members
    where trim(naver_id) = v_naver_id
      and trim(cafe_nickname) = v_display_name;
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

-- 일괄 동기화: trim 비교
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
          where trim(c.naver_id) = trim(p.naver_id)
            and trim(c.cafe_nickname) = trim(p.display_name)
        )
      returning 1
  )
  select count(*) into v_count from matched;
  return v_count;
end;
$$;

-- 명부 추가 시: trim 비교
create or replace function public.auto_paid_on_cafe_member_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.naver_id is null or trim(new.naver_id) = '' or new.cafe_nickname is null then
    return new;
  end if;
  update public.profiles
    set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
    where trim(naver_id) = trim(new.naver_id)
      and trim(display_name) = trim(new.cafe_nickname)
      and tier <> 'paid';
  return new;
end;
$$;

-- 일회성 보정: 기존 데이터의 앞뒤 공백 정리
update public.profiles set display_name = trim(display_name) where display_name <> trim(display_name);
update public.profiles set naver_id = trim(naver_id) where naver_id is not null and naver_id <> trim(naver_id);
update public.cafe_paid_members set cafe_nickname = trim(cafe_nickname) where cafe_nickname <> trim(cafe_nickname);
update public.cafe_paid_members set naver_id = trim(naver_id) where naver_id <> trim(naver_id);

-- 위 trim 후, 다시 매칭 안 된 사람 일괄 paid 전환
update public.profiles p
  set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
  where p.naver_id is not null
    and p.tier <> 'paid'
    and exists (
      select 1 from public.cafe_paid_members c
      where c.naver_id = p.naver_id and c.cafe_nickname = p.display_name
    );
