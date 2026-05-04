-- ──────────────────────────────────────────────
-- 036: profiles.naver_id 또는 display_name 변경 시 자동 재매칭
-- 사용자가 가입 후 naver_id/닉네임을 수정하면 카페 명부와 다시 비교해서 paid 전환
-- ──────────────────────────────────────────────

create or replace function public.recheck_paid_on_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- naver_id/display_name 변경 시에만 트리거
  if (new.naver_id is not distinct from old.naver_id)
     and (new.display_name is not distinct from old.display_name) then
    return new;
  end if;

  -- 이미 paid면 다운그레이드 하지 않음 (기존 권리 유지)
  if new.tier = 'paid' then
    return new;
  end if;

  if new.naver_id is null or trim(new.naver_id) = '' then
    return new;
  end if;

  if exists (
    select 1 from public.cafe_paid_members c
    where trim(c.naver_id) = trim(new.naver_id)
      and trim(c.cafe_nickname) = trim(coalesce(new.display_name, ''))
  ) then
    new.tier := 'paid';
    new.tier_expires_at := '2099-12-31'::timestamptz;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_recheck_paid_on_update on public.profiles;
create trigger profile_recheck_paid_on_update
  before update on public.profiles
  for each row execute function public.recheck_paid_on_profile_update();

comment on function public.recheck_paid_on_profile_update is 'profiles.naver_id/display_name 변경 시 카페 명부 재매칭 → 자동 paid 전환';
