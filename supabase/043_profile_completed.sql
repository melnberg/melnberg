-- ──────────────────────────────────────────────
-- 043: profile_completed_at — OAuth 가입자 보충 폼 강제용
-- 이메일 가입자: 가입 직후 자동 true (raw metadata 기반)
-- OAuth 가입자: false → /complete-signup 에서 보충 폼 제출 시 true
-- ──────────────────────────────────────────────

alter table public.profiles
  add column if not exists profile_completed_at timestamptz;

-- 기존 가입자(이메일)는 모두 완료 처리 (소급)
update public.profiles
  set profile_completed_at = coalesce(profile_completed_at, created_at)
  where profile_completed_at is null and display_name is not null;

-- handle_new_user 트리거: raw_user_meta_data에 우리 가입 폼 마커 있으면 완료 처리
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
  v_form_signup boolean := (new.raw_user_meta_data ? 'mlbg_signup'); -- 우리 가입폼 마커
  v_is_paid boolean := false;
begin
  if v_naver_id is not null then
    select true into v_is_paid
    from public.cafe_paid_members
    where trim(naver_id) = v_naver_id
      and trim(cafe_nickname) = v_display_name;
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

comment on column public.profiles.profile_completed_at is '보충 폼(닉네임·네이버ID·휴대폰) 입력 완료 시각. NULL이면 /complete-signup 강제.';
