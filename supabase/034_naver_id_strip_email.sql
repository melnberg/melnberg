-- ──────────────────────────────────────────────
-- 034: 네이버 ID 자동 정규화 — 풀 이메일 입력 시 앞부분만 저장
-- 사용자가 'jiroclinic@naver.com' 입력해도 'jiroclinic' 으로 비교
-- ──────────────────────────────────────────────

-- 가입 트리거: split_part 로 @ 앞부분만 사용
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_naver_raw text := nullif(trim(new.raw_user_meta_data->>'naver_id'), '');
  v_naver_id text := nullif(split_part(v_naver_raw, '@', 1), '');
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

-- 일회성 보정: 기존 profiles.naver_id 에 들어간 풀이메일을 앞부분만 남기기
update public.profiles
  set naver_id = split_part(naver_id, '@', 1)
  where naver_id like '%@%';

-- 그 후 다시 매칭
update public.profiles p
  set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
  where p.naver_id is not null
    and p.tier <> 'paid'
    and exists (
      select 1 from public.cafe_paid_members c
      where trim(c.naver_id) = trim(p.naver_id)
        and trim(c.cafe_nickname) = trim(p.display_name)
    );
