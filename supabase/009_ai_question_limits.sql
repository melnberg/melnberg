-- ──────────────────────────────────────────────
-- 009: AI 질문 일일 한도 — 사용자별·IP별 질문 로그
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 목적: 한 사용자/IP가 하루에 N번 이상 질문 못 하게 차단 (API 비용 폭주 방지)
--   - 로그인 사용자: user_id 기준 (free 5/day, paid 50/day, admin 무제한)
--   - 비로그인: IP 기준 (3/day)
-- ──────────────────────────────────────────────

create table if not exists public.ai_question_logs (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,  -- nullable: 비로그인 가능
  ip_address text,
  asked_at timestamp with time zone default now() not null,
  question text
);

create index if not exists ai_question_logs_user_date_idx
  on public.ai_question_logs (user_id, asked_at desc)
  where user_id is not null;

create index if not exists ai_question_logs_ip_date_idx
  on public.ai_question_logs (ip_address, asked_at desc)
  where user_id is null;

-- RLS — 자기 로그만, 어드민은 전체. insert는 SECURITY DEFINER 함수로
alter table public.ai_question_logs enable row level security;

drop policy if exists "Users can read own AI logs" on public.ai_question_logs;
create policy "Users can read own AI logs"
  on public.ai_question_logs for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ─── 로그인 사용자 한도 검사 + 로그 기록
create or replace function public.check_and_log_ai_question(
  q_user_id uuid,
  q_question text,
  q_daily_limit int
)
returns table (
  used_today int,
  daily_limit int,
  blocked boolean
)
language plpgsql
security definer set search_path = public
as $$
declare
  cnt int;
  day_start timestamp with time zone;
begin
  -- KST(한국 시간) 기준 자정부터 카운트
  day_start := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';

  select count(*)::int into cnt
  from public.ai_question_logs
  where user_id = q_user_id
    and asked_at >= day_start;

  if cnt >= q_daily_limit then
    return query select cnt, q_daily_limit, true;
    return;
  end if;

  insert into public.ai_question_logs (user_id, question)
  values (q_user_id, q_question);

  return query select (cnt + 1), q_daily_limit, false;
end;
$$;

-- ─── 비로그인 IP 기반 한도 검사 + 로그 기록
create or replace function public.check_and_log_ai_question_ip(
  q_ip text,
  q_question text,
  q_daily_limit int
)
returns table (
  used_today int,
  daily_limit int,
  blocked boolean
)
language plpgsql
security definer set search_path = public
as $$
declare
  cnt int;
  day_start timestamp with time zone;
begin
  day_start := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';

  select count(*)::int into cnt
  from public.ai_question_logs
  where user_id is null
    and ip_address = q_ip
    and asked_at >= day_start;

  if cnt >= q_daily_limit then
    return query select cnt, q_daily_limit, true;
    return;
  end if;

  insert into public.ai_question_logs (user_id, ip_address, question)
  values (null, q_ip, q_question);

  return query select (cnt + 1), q_daily_limit, false;
end;
$$;
