-- ──────────────────────────────────────────────
-- 138: 닉네임 변경 시 자동 등업 (063 보완)
--
-- 사고 (2026-05-06) 진단:
--   카페 명부에 먼저 등록 + 사이트 가입 시 닉네임이 한 글자 다름
--   → handle_new_user 매칭 실패 → free
--   본인이 나중에 닉네임 정정 → 매칭 가능해졌으나 재매칭 트리거 없음 → 그대로 free
--
--   기존 규칙 한계:
--     - 063 트리거: naver_id 변경 시만 매칭 시도
--     - 049 트리거: display_name 변경 시 강등만 (승급 X)
--
-- 해결: display_name 변경 시 매칭되면 paid 로 승급 (049 의 반대 방향).
-- ──────────────────────────────────────────────

create or replace function public.auto_paid_on_profile_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- naver_id 비어있거나 이미 paid 면 skip
  if new.naver_id is null or new.naver_id = '' then return new; end if;
  if new.tier = 'paid' then return new; end if;
  -- display_name 이 실제 변경된 경우만 (INSERT 도 포함됨)
  if tg_op = 'UPDATE' and new.display_name = old.display_name then return new; end if;
  -- 카페 명부에 매칭되면 paid 전환 (063 와 동일 — naver_id 만으로도 충분)
  if exists (
    select 1 from public.cafe_paid_members
    where trim(naver_id) = trim(new.naver_id)
  ) then
    new.tier := 'paid';
    new.tier_expires_at := '2099-12-31'::timestamptz;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_display_name_paid_promote on public.profiles;
create trigger profile_display_name_paid_promote
  before insert or update of display_name on public.profiles
  for each row execute function public.auto_paid_on_profile_display_name();

comment on function public.auto_paid_on_profile_display_name is
  '063 보완 — display_name 변경 시 naver_id 매칭되면 paid 승급. 049 (강등) 의 반대.';

-- 확인용: 현재 누락된 free 사용자 일괄 승급 (오늘 처리한 5명 외 미래 추가 케이스 대비)
update public.profiles p
  set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
  where p.tier <> 'paid'
    and p.naver_id is not null
    and p.naver_id <> ''
    and exists (
      select 1 from public.cafe_paid_members c
      where trim(c.naver_id) = trim(p.naver_id)
    );

notify pgrst, 'reload schema';
