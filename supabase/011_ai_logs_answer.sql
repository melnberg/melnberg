-- ──────────────────────────────────────────────
-- 011: AI 질문 로그에 답변 텍스트 저장
-- 목적: 어드민 페이지에서 사용자별 질문+답변 기록 같이 보기
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

alter table public.ai_question_logs
  add column if not exists answer text;

-- 결과 업데이트 RPC를 답변까지 받게 확장
drop function if exists public.update_ai_log_results(bigint, int, int);

create or replace function public.update_ai_log_results(
  q_log_id bigint,
  q_chunk_count int,
  q_source_count int,
  q_answer text default null
)
returns void
language sql
security definer set search_path = public
as $$
  update public.ai_question_logs
  set chunk_count = q_chunk_count,
      source_count = q_source_count,
      answer = coalesce(q_answer, answer)
  where id = q_log_id;
$$;

-- 답변만 별도 업데이트하는 RPC (스트리밍 끝난 후 호출)
create or replace function public.update_ai_log_answer(
  q_log_id bigint,
  q_answer text
)
returns void
language sql
security definer set search_path = public
as $$
  update public.ai_question_logs
  set answer = q_answer
  where id = q_log_id;
$$;
