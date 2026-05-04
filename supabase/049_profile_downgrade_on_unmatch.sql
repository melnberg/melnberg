-- ──────────────────────────────────────────────
-- 049: profiles 트리거 — 닉네임/네이버ID 변경 시 카페 매칭 재평가
-- 매칭 → 조합원(paid)
-- 비매칭 → 카페 매칭으로 받은 paid (만료일=2099-12-31) 만 강등
-- 토스 결제로 받은 paid (실제 만료일) 는 유지
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

  -- 새 값으로 카페 매칭 시도
  if new.naver_id is not null and trim(new.naver_id) <> '' then
    v_matched := exists (
      select 1 from public.cafe_paid_members c
      where trim(c.naver_id) = trim(new.naver_id)
        and trim(c.cafe_nickname) = trim(coalesce(new.display_name, ''))
    );
  end if;

  if v_matched then
    -- 매칭 → paid 보장 (이미 paid 여도 만료일 갱신)
    new.tier := 'paid';
    new.tier_expires_at := '2099-12-31'::timestamptz;
  else
    -- 비매칭 → 카페 매칭으로 받은 paid 만 강등 (만료일 = 2099 가 카페 marker)
    if new.tier = 'paid'
       and new.tier_expires_at is not null
       and extract(year from new.tier_expires_at) >= 2099 then
      new.tier := 'free';
      new.tier_expires_at := null;
    end if;
    -- 그 외 (free 거나, 토스 결제로 받은 paid) 는 유지
  end if;

  return new;
end;
$$;

comment on function public.recheck_paid_on_profile_update is
  '닉네임·네이버ID 변경 시 카페 매칭 재평가. 매칭→paid, 비매칭→카페 매칭으로 받은 paid 만 강등 (토스 결제는 유지).';
