-- ──────────────────────────────────────────────
-- 069: 활성화 강화 — 출석 체크 streak + 좋아요 보너스 + 자산 랭킹 view
-- A. 출석 체크: 일일 +0.5, 7/30/100/365일 연속 누적 보너스
-- B. 좋아요 받으면 작성자에게 +0.2 mlbg (단지 토론 up vote)
-- C. 자산 랭킹 view — mlbg 잔액 + 보유 단지 분양가 합산
-- ──────────────────────────────────────────────

-- ── A. 출석 체크 ─────────────────────────────────
alter table public.profiles
  add column if not exists last_checkin_date date,
  add column if not exists checkin_streak int not null default 0,
  add column if not exists checkin_max_streak int not null default 0;

comment on column public.profiles.last_checkin_date is '마지막 출석 날짜 (KST). NULL = 한 번도 안 함.';
comment on column public.profiles.checkin_streak is '현재 연속 출석 일수.';
comment on column public.profiles.checkin_max_streak is '역대 최장 연속 출석 일수.';

create or replace function public.daily_checkin()
returns table(out_success boolean, out_earned numeric, out_streak int, out_bonus_label text, out_message text)
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
begin
  if v_uid is null then
    return query select false, 0::numeric, 0, null::text, '로그인이 필요해요'::text;
    return;
  end if;

  select last_checkin_date, checkin_streak into v_last, v_streak
    from public.profiles where id = v_uid for update;

  if v_last = v_today then
    return query select false, 0::numeric, coalesce(v_streak, 0), null::text, '오늘은 이미 출석 완료'::text;
    return;
  end if;

  -- 연속 판정: 어제와 오늘 사이 1일 차이면 streak 유지·증가, 아니면 리셋
  if v_last = v_today - 1 then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  -- 보상: 기본 0.5, streak 마일스톤 보너스 누적
  if v_streak = 7 then
    v_earned := v_earned + 5;
    v_bonus := '7일 연속! +5 mlbg';
  elsif v_streak = 30 then
    v_earned := v_earned + 20;
    v_bonus := '30일 연속! +20 mlbg';
  elsif v_streak = 100 then
    v_earned := v_earned + 100;
    v_bonus := '100일 연속! +100 mlbg';
  elsif v_streak = 365 then
    v_earned := v_earned + 1000;
    v_bonus := '365일 1주년! +1000 mlbg';
  end if;

  update public.profiles
    set last_checkin_date = v_today,
        checkin_streak = v_streak,
        checkin_max_streak = greatest(checkin_max_streak, v_streak),
        mlbg_balance = coalesce(mlbg_balance, 0) + v_earned
    where id = v_uid;

  return query select true, v_earned, v_streak, v_bonus, null::text;
end;
$$;
grant execute on function public.daily_checkin() to authenticated;

-- ── B. 좋아요 받으면 작성자에게 보너스 mlbg ──────────
-- apt_discussion_votes INSERT (vote_type='up') → 작성자 +0.2 mlbg.
-- 본인 글 추천 X. UPDATE/DELETE 는 무시 (revoke 시에도 이미 받은 보너스 유지).

create or replace function public.award_vote_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  if new.vote_type <> 'up' then return new; end if;
  select author_id into v_author_id from public.apt_discussions where id = new.discussion_id;
  if v_author_id is null or v_author_id = new.user_id then return new; end if;
  update public.profiles
    set mlbg_balance = coalesce(mlbg_balance, 0) + 0.2
    where id = v_author_id;
  return new;
end;
$$;

drop trigger if exists trg_award_vote_bonus on public.apt_discussion_votes;
create trigger trg_award_vote_bonus
  after insert on public.apt_discussion_votes
  for each row execute function public.award_vote_bonus();

comment on function public.award_vote_bonus is '단지 토론 글에 좋아요(up) 들어오면 작성자에게 +0.2 mlbg. 본인 추천 제외, revoke 시 차감 안 함.';

-- ── C. 자산 랭킹 view ────────────────────────────
-- mlbg 잔액 + 보유 단지 분양가 합산.
-- get_apt_listing_price(lawd_cd) 사용 (SQL 058).
create or replace view public.user_wealth_ranking as
  select
    p.id,
    p.display_name,
    p.tier,
    p.tier_expires_at,
    p.mlbg_balance,
    coalesce(asset.value, 0) as apt_value,
    coalesce(p.mlbg_balance, 0) + coalesce(asset.value, 0) as total_wealth,
    coalesce(asset.cnt, 0) as apt_count
  from public.profiles p
  left join lateral (
    select sum(public.get_apt_listing_price(am.lawd_cd))::numeric as value,
           count(*) as cnt
    from public.apt_master am
    where am.occupier_id = p.id
  ) asset on true
  where p.tier in ('paid', 'free') -- 모든 등급 포함
  order by total_wealth desc;

grant select on public.user_wealth_ranking to anon, authenticated;
comment on view public.user_wealth_ranking is '자산 랭킹 — mlbg 잔액 + 보유 단지 분양가 합. 마퀴 두 번째 줄용.';

-- 빠른 fetch 용 RPC (top N 만 반환)
create or replace function public.get_wealth_ranking(p_limit int default 10)
returns table(
  user_id uuid,
  display_name text,
  total_wealth numeric,
  mlbg_balance numeric,
  apt_value numeric,
  apt_count int
)
language sql
stable
as $$
  select id, display_name, total_wealth, mlbg_balance, apt_value, apt_count::int
  from public.user_wealth_ranking
  where display_name is not null
  order by total_wealth desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
grant execute on function public.get_wealth_ranking(int) to anon, authenticated;
