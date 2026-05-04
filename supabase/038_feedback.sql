-- ──────────────────────────────────────────────
-- 038: feedback — 사용자 불편사항 신고
-- 누구나 INSERT, 관리자만 SELECT
-- ──────────────────────────────────────────────

create table if not exists public.feedback (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  display_name text,
  email text,
  message text not null,
  user_agent text,
  page_url text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists feedback_created_at_idx
  on public.feedback(created_at desc);

alter table public.feedback enable row level security;

-- 누구나 (비로그인 포함) 신고 가능
drop policy if exists "anyone can insert feedback" on public.feedback;
create policy "anyone can insert feedback"
  on public.feedback for insert
  with check (true);

-- 관리자만 조회·수정·삭제
drop policy if exists "admins read feedback" on public.feedback;
create policy "admins read feedback"
  on public.feedback for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "admins update feedback" on public.feedback;
create policy "admins update feedback"
  on public.feedback for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "admins delete feedback" on public.feedback;
create policy "admins delete feedback"
  on public.feedback for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

comment on table public.feedback is '사용자 불편사항·제안 신고. 우측 하단 위젯으로 받음.';
