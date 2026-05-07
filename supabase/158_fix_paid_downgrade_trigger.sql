-- ──────────────────────────────────────────────
-- 158: 정회원 강등 사고 재발 방지 — 049 트리거 매칭 기준 단일화
--
-- 사고: profiles 에 BEFORE-UPDATE 트리거 3개 (138, 063, 049) 가 동시에 걸림.
-- 알파벳 순 발화:
--   1) profile_display_name_paid_promote (138) — naver_id 만 매칭 → paid
--   2) profile_naver_id_paid_match       (063) — naver_id 만 매칭 → paid
--   3) profile_recheck_paid_on_update    (049) — naver_id+display_name 둘 다 strict → 비매칭 시 강등
-- 138/063 가 paid 올려놔도 049 가 display_name 1글자 차이로도 즉시 downgrade.
-- 결과: 닉네임이 카페 명부와 살짝만 달라도 (공백·이모지·대소문자 등) 정회원 강등.
-- 매번 어드민이 수동 등업해도 다음 profile UPDATE 때 또 강등 → 지속 재발.
--
-- 해결:
--   1) recheck_paid_on_profile_update 의 매칭을 naver_id 단일로 통일.
--      138/063 와 일관 → 트리거 간 충돌 제거.
--   2) 강등 조건도 그대로 유지: naver_id 가 카페에 더 이상 없을 때만 (year=2099 marker) 강등.
--   3) 사고로 강등됐던 사용자들 일괄 재승급.
-- ──────────────────────────────────────────────

create or replace function public.recheck_paid_on_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matched boolean := false;
begin
  -- 닉네임/네이버ID 변경 없으면 스킵
  if (new.naver_id is not distinct from old.naver_id)
     and (new.display_name is not distinct from old.display_name) then
    return new;
  end if;

  -- naver_id 만으로 매칭 (138/063 와 일관). display_name strict 검증은 제거 —
  -- 닉네임 미세 차이로 강등되던 사고 방지.
  if new.naver_id is not null and trim(new.naver_id) <> '' then
    v_matched := exists (
      select 1 from public.cafe_paid_members c
      where trim(c.naver_id) = trim(new.naver_id)
    );
  end if;

  if v_matched then
    -- 매칭 → paid 보장 (이미 paid 여도 만료일 갱신)
    new.tier := 'paid';
    new.tier_expires_at := '2099-12-31'::timestamptz;
  else
    -- naver_id 가 카페 명부에 더 이상 없을 때만 강등 (카페 marker = year 2099).
    -- 토스 결제로 받은 paid (실제 만료일) 는 유지.
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
  '049 보완 (158) — naver_id 단일 매칭. display_name strict 검증 제거 (트리거 충돌·미세 차이 강등 방지).';

-- 사고로 강등된 사용자 일괄 재승급. 카페 명부에 naver_id 가 있는데 free 인 사람.
update public.profiles p
  set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
  where p.tier <> 'paid'
    and p.naver_id is not null
    and trim(p.naver_id) <> ''
    and exists (
      select 1 from public.cafe_paid_members c
      where trim(c.naver_id) = trim(p.naver_id)
    );

notify pgrst, 'reload schema';
