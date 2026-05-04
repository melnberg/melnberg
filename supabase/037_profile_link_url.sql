-- ──────────────────────────────────────────────
-- 037: profiles.link_url — 사용자 블로그/SNS 링크 (선택)
-- 내부 프로필 페이지 (/u/{id}) 에서 외부 링크 아이콘으로 노출
-- ──────────────────────────────────────────────

alter table public.profiles
  add column if not exists link_url text;

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
  v_is_paid boolean := false;
begin
  if v_naver_id is not null then
    select true into v_is_paid
    from public.cafe_paid_members
    where trim(naver_id) = v_naver_id
      and trim(cafe_nickname) = v_display_name;
  end if;

  insert into public.profiles (id, display_name, naver_id, link_url, tier, tier_expires_at)
  values (
    new.id,
    v_display_name,
    v_naver_id,
    v_link_url,
    case when v_is_paid then 'paid' else 'free' end,
    case when v_is_paid then '2099-12-31'::timestamptz else null end
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    naver_id = coalesce(excluded.naver_id, public.profiles.naver_id),
    link_url = coalesce(excluded.link_url, public.profiles.link_url),
    tier = case when v_is_paid then 'paid' else public.profiles.tier end,
    tier_expires_at = case when v_is_paid then '2099-12-31'::timestamptz else public.profiles.tier_expires_at end;
  return new;
end;
$$;

comment on column public.profiles.link_url is '사용자 블로그/SNS 링크 (선택). 내부 프로필 페이지에서 외부 아이콘으로 노출.';
