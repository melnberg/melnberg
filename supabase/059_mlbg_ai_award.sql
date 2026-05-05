-- ──────────────────────────────────────────────
-- 059: AI 품질 평가 기반 차등 mlbg 적립
-- 058 의 고정 적립 트리거를 끄고, API 에서 OpenAI 평가 후
-- (base × multiplier) 만큼 가산. 의미없는 글은 0.1배만 받음.
-- ──────────────────────────────────────────────

-- 1) 058 의 고정 적립 트리거 제거 — AI 가 단독으로 결정
drop trigger if exists trg_mlbg_earn_apt_post on public.apt_discussions;
drop trigger if exists trg_mlbg_earn_apt_comment on public.apt_discussion_comments;
drop trigger if exists trg_mlbg_earn_post on public.posts;
drop trigger if exists trg_mlbg_earn_comment on public.comments;
drop function if exists public.mlbg_earn_apt_post();
drop function if exists public.mlbg_earn_apt_comment();
drop function if exists public.mlbg_earn_post();
drop function if exists public.mlbg_earn_comment();

-- 2) 적립 로그 — 어떤 글/댓글이 얼마 받았는지
create table if not exists public.mlbg_award_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('apt_post','apt_comment','community_post','community_comment')),
  ref_id bigint not null,
  base numeric not null,
  multiplier numeric not null,
  earned numeric not null,
  ai_reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_mlbg_award_kind_ref on public.mlbg_award_log(kind, ref_id);
create index if not exists idx_mlbg_award_user on public.mlbg_award_log(user_id, created_at desc);

alter table public.mlbg_award_log enable row level security;
drop policy if exists "mlbg award readable by owner" on public.mlbg_award_log;
create policy "mlbg award readable by owner"
  on public.mlbg_award_log for select using (auth.uid() = user_id);
-- INSERT/UPDATE 는 service role 만 (RLS 통과 안 됨 → API 라우트에서 service_role 사용)

comment on table public.mlbg_award_log is 'AI 평가 기반 mlbg 적립 로그. (kind, ref_id) 유니크 — 같은 글 중복 적립 방지.';

-- 3) AI 평가 실패시 fallback — 기본값 1.0 (그대로 base 지급)
-- 적립 로직 자체는 API 라우트에서 service_role 로 직접 update profiles.mlbg_balance 함

-- 4) 기존 글/댓글 중 award 없는 것 1회 일괄 보정 (선택)
-- 이미 058 트리거로 적립된 사용자는 mlbg_balance 가 누적되어 있으므로 추가 작업 불필요.

-- 5) atomic 잔액 증감 RPC — race 안전
create or replace function public.increment_mlbg_balance(p_user_id uuid, p_delta numeric)
returns numeric
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set mlbg_balance = coalesce(mlbg_balance, 0) + p_delta
   where id = p_user_id
   returning mlbg_balance;
$$;
grant execute on function public.increment_mlbg_balance(uuid, numeric) to authenticated, service_role;
comment on function public.increment_mlbg_balance is 'mlbg_balance += delta (음수 가능). 차감 시 음수 방지는 호출측 책임.';

-- 6) 적립 합산 helper — 디버깅·관리용
create or replace function public.get_user_mlbg_summary(p_user_id uuid)
returns table(
  kind text,
  total_earned numeric,
  count_records bigint,
  avg_multiplier numeric
)
language sql
stable
as $$
  select kind,
         sum(earned) as total_earned,
         count(*)    as count_records,
         round(avg(multiplier)::numeric, 2) as avg_multiplier
    from public.mlbg_award_log
   where user_id = p_user_id
   group by kind;
$$;
grant execute on function public.get_user_mlbg_summary(uuid) to authenticated;
