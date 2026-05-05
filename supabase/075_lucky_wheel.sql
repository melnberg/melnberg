-- ──────────────────────────────────────────────
-- 075: 출석 시 럭키 룰렛 — 카지노 도파민
-- daily_checkin 호출 시 random 보상 추가 지급. 확률표 + 등급 라벨 반환.
--   90%   : 1~3 mlbg (꽝)
--   9%    : 5~15 mlbg (소액 당첨)
--   0.9%  : 30~100 mlbg (대박)
--   0.1%  : 500 mlbg (잭팟)
-- ──────────────────────────────────────────────

-- 기존 함수와 반환 타입 충돌 — DROP 후 재생성
drop function if exists public.daily_checkin();
create or replace function public.daily_checkin()
returns table(
  out_success boolean,
  out_earned numeric,
  out_streak int,
  out_bonus_label text,
  out_spin_amount numeric,
  out_spin_grade text,   -- 'miss' | 'small' | 'big' | 'jackpot'
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
  v_earned numeric := 0.5;
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

  -- streak 마일스톤 보너스 (기존 069 유지)
  if v_streak = 7 then
    v_earned := v_earned + 5; v_bonus := '7일 연속! +5 mlbg';
  elsif v_streak = 30 then
    v_earned := v_earned + 20; v_bonus := '30일 연속! +20 mlbg';
  elsif v_streak = 100 then
    v_earned := v_earned + 100; v_bonus := '100일 연속! +100 mlbg';
  elsif v_streak = 365 then
    v_earned := v_earned + 1000; v_bonus := '365일 1주년! +1000 mlbg';
  end if;

  -- 럭키 룰렛 — random() 0~1
  v_roll := random();
  if v_roll < 0.001 then
    -- 0.1% 잭팟
    v_spin := 500;
    v_grade := 'jackpot';
  elsif v_roll < 0.01 then
    -- 0.9% 대박
    v_spin := 30 + floor(random() * 71); -- 30~100
    v_grade := 'big';
  elsif v_roll < 0.1 then
    -- 9% 소액 당첨
    v_spin := 5 + floor(random() * 11); -- 5~15
    v_grade := 'small';
  else
    -- 90% 꽝 (1~3 mlbg)
    v_spin := 1 + floor(random() * 3); -- 1~3
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

comment on function public.daily_checkin is '출석 체크 + 럭키 룰렛 (075). 기본 mlbg + streak 보너스 + 룰렛 random 보상.';
