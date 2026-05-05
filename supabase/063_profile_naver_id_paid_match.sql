-- ──────────────────────────────────────────────
-- 063: 양방향 카페 매칭 — profile 가입 시점에도 자동 등업
-- 028 의 단방향 트리거를 보완.
--   기존: cafe_paid_members INSERT → 매칭 profile 등업
--   추가: profile naver_id 입력/수정 → 매칭 명부 있으면 즉시 등업
-- 카페 먼저 등업 → 사이트 나중 가입 케이스 자동 처리.
-- ──────────────────────────────────────────────

create or replace function public.auto_paid_on_profile_naver_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.naver_id is null or new.naver_id = '' then
    return new;
  end if;
  -- 이미 paid 면 건드리지 않음 (만료일 보존)
  if new.tier = 'paid' then
    return new;
  end if;
  -- 카페 명부에 있으면 즉시 paid 전환 (만료일 = 2099-12-31, 카페 동기화 룰)
  if exists (select 1 from public.cafe_paid_members where naver_id = new.naver_id) then
    new.tier := 'paid';
    new.tier_expires_at := '2099-12-31'::timestamptz;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_naver_id_paid_match on public.profiles;
create trigger profile_naver_id_paid_match
  before insert or update of naver_id on public.profiles
  for each row execute function public.auto_paid_on_profile_naver_id();

comment on function public.auto_paid_on_profile_naver_id is
  'profile 의 naver_id 가 set/변경될 때 cafe_paid_members 와 매칭되면 즉시 paid 전환. 028 의 역방향 보완.';

-- 기존 미매칭 회원 일괄 동기화 (이미 가입했지만 카페 명부에 있는데 free 인 사람들)
update public.profiles p
set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
where p.tier <> 'paid'
  and exists (
    select 1 from public.cafe_paid_members cm
    where cm.naver_id = p.naver_id
  );
