-- ──────────────────────────────────────────────
-- 010: AI 질문 로그에 검색 결과 개수 추가
-- 목적: "자료 없음" 응답이 나간 질문을 추적 (어떤 주제가 DB에 부족한지 파악)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- 1. 컬럼 추가 (nullable, 검색 후 업데이트됨)
alter table public.ai_question_logs
  add column if not exists chunk_count int,
  add column if not exists source_count int;

-- 2. 기존 한도 검사 RPC를 log_id 반환하도록 수정
-- (return type 변경이라 DROP 후 재생성 필요)
drop function if exists public.check_and_log_ai_question(uuid, text, int);
create or replace function public.check_and_log_ai_question(
  q_user_id uuid,
  q_question text,
  q_daily_limit int
)
returns table (
  log_id bigint,
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
  new_id bigint;
begin
  day_start := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';

  select count(*)::int into cnt
  from public.ai_question_logs
  where user_id = q_user_id
    and asked_at >= day_start;

  if cnt >= q_daily_limit then
    return query select null::bigint, cnt, q_daily_limit, true;
    return;
  end if;

  insert into public.ai_question_logs (user_id, question)
  values (q_user_id, q_question)
  returning id into new_id;

  return query select new_id, (cnt + 1), q_daily_limit, false;
end;
$$;

-- 3. IP 기반 RPC도 동일하게 수정
drop function if exists public.check_and_log_ai_question_ip(text, text, int);
create or replace function public.check_and_log_ai_question_ip(
  q_ip text,
  q_question text,
  q_daily_limit int
)
returns table (
  log_id bigint,
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
  new_id bigint;
begin
  day_start := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';

  select count(*)::int into cnt
  from public.ai_question_logs
  where user_id is null
    and ip_address = q_ip
    and asked_at >= day_start;

  if cnt >= q_daily_limit then
    return query select null::bigint, cnt, q_daily_limit, true;
    return;
  end if;

  insert into public.ai_question_logs (user_id, ip_address, question)
  values (null, q_ip, q_question)
  returning id into new_id;

  return query select new_id, (cnt + 1), q_daily_limit, false;
end;
$$;

-- 4. 검색 결과 개수 업데이트 RPC (검색 끝난 후 호출)
create or replace function public.update_ai_log_results(
  q_log_id bigint,
  q_chunk_count int,
  q_source_count int
)
returns void
language sql
security definer set search_path = public
as $$
  update public.ai_question_logs
  set chunk_count = q_chunk_count,
      source_count = q_source_count
  where id = q_log_id;
$$;
