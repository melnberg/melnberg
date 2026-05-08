-- ──────────────────────────────────────────────
-- 192: 출석 럭키 룰렛 — 보상 2.5배 버프
-- 075 의 daily_checkin() 을 재정의. 기본·streak·룰렛 모든 보상 ~2.5배 상향.
-- 변경:
--   기본            0.5 → 1.5
--   streak 7일      +5 → +12
--   streak 30일     +20 → +50
--   streak 100일    +100 → +250
--   streak 365일    +1000 → +2500
--   90% 꽝          1~3 → 3~8
--   9% 소액         5~15 → 12~40
--   0.9% 대박       30~100 → 80~250
--   0.1% 잭팟       500 → 1500
-- ──────────────────────────────────────────────

drop function if exists public.daily_checkin();
create or replace function public.daily_checkin()
returns table(
  out_success boolean,
  out_earned numeric,
  out_streak int,
  out_bonus_label text,
  out_spin_amount numeric,
  out_spin_grade text,
  out_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := ((current_timestamp at time zone 'Asia/Seoul')::date);
  v_last date;
  v_streak int;
  v_earned numeric := 1.5;  -- 0.5 → 1.5
  v_bonus text := null;
  v_roll numeric;
  v_spin numeric := 0;
  v_grade text := 'miss';
begin
  if v_uid is null then
    return query select false, 0::numeric, 0, null::text, 0::numeric, 'miss'::text, '로그인이 필요해요'::text;
    return;
  end if;

  select last_checkin_date, checkin_streak into v_last, v_streak
    from public.profiles where id = v_uid for update;

  if v_last = v_today then
    return query select false, 0::numeric, coalesce(v_streak, 0), null::text, 0::numeric, 'miss'::text, '오늘은 이미 출석 완료'::text;
    return;
  end if;

  if v_last = v_today - 1 then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  -- streak 마일스톤 보너스 (2.5배)
  if v_streak = 7 then
    v_earned := v_earned + 12; v_bonus := '7일 연속! +12 mlbg';
  elsif v_streak = 30 then
    v_earned := v_earned + 50; v_bonus := '30일 연속! +50 mlbg';
  elsif v_streak = 100 then
    v_earned := v_earned + 250; v_bonus := '100일 연속! +250 mlbg';
  elsif v_streak = 365 then
    v_earned := v_earned + 2500; v_bonus := '365일 1주년! +2500 mlbg';
  end if;

  -- 럭키 룰렛 (2.5배)
  v_roll := random();
  if v_roll < 0.001 then
    v_spin := 1500;  -- 잭팟
    v_grade := 'jackpot';
  elsif v_roll < 0.01 then
    v_spin := 80 + floor(random() * 171);  -- 80~250 대박
    v_grade := 'big';
  elsif v_roll < 0.1 then
    v_spin := 12 + floor(random() * 29);   -- 12~40 소액
    v_grade := 'small';
  else
    v_spin := 3 + floor(random() * 6);     -- 3~8 꽝
    v_grade := 'miss';
  end if;

  update public.profiles
    set last_checkin_date = v_today,
        checkin_streak = v_streak,
        checkin_max_streak = greatest(checkin_max_streak, v_streak),
        mlbg_balance = coalesce(mlbg_balance, 0) + v_earned + v_spin
    where id = v_uid;

  return query select true, v_earned, v_streak, v_bonus, v_spin, v_grade, null::text;
end;
$$;

grant execute on function public.daily_checkin() to authenticated;

comment on function public.daily_checkin is '출석 체크 + 럭키 룰렛 (192 버프). 보상 ~2.5배.';
