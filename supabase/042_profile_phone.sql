-- ──────────────────────────────────────────────
-- 042: profiles.phone — 휴대폰 번호 (1인 1계정 강제)
-- 가입 시 받음. 추후 SMS OTP 인증 추가 가능.
-- ──────────────────────────────────────────────

alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_verified_at timestamptz;

-- 중복 방지 (같은 번호 1회만)
create unique index if not exists profiles_phone_unique
  on public.profiles(phone)
  where phone is not null;

-- 가입 트리거에 phone 처리 추가
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_naver_raw text := nullif(trim(new.raw_user_meta_data->>'naver_id'), '');
  v_naver_id text := nullif(split_part(v_naver_raw, '@', 1), '');
  v_display_name text := trim(coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  v_link_url text := nullif(trim(new.raw_user_meta_data->>'link_url'), '');
  v_phone text := nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'phone', ''), '[^0-9]', '', 'g'), '');
  v_is_paid boolean := false;
begin
  if v_naver_id is not null then
    select true into v_is_paid
    from public.cafe_paid_members
    where trim(naver_id) = v_naver_id
      and trim(cafe_nickname) = v_display_name;
  end if;

  insert into public.profiles (id, display_name, naver_id, link_url, phone, tier, tier_expires_at)
  values (
    new.id,
    v_display_name,
    v_naver_id,
    v_link_url,
    v_phone,
    case when v_is_paid then 'paid' else 'free' end,
    case when v_is_paid then '2099-12-31'::timestamptz else null end
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    naver_id = coalesce(excluded.naver_id, public.profiles.naver_id),
    link_url = coalesce(excluded.link_url, public.profiles.link_url),
    phone = coalesce(excluded.phone, public.profiles.phone),
    tier = case when v_is_paid then 'paid' else public.profiles.tier end,
    tier_expires_at = case when v_is_paid then '2099-12-31'::timestamptz else public.profiles.tier_expires_at end;
  return new;
end;
$$;

comment on column public.profiles.phone is '휴대폰 번호 (숫자만). 1인 1계정 강제용. unique.';
comment on column public.profiles.phone_verified_at is 'SMS OTP 인증 완료 시각. null이면 미인증.';
