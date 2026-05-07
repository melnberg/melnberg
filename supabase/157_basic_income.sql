-- ──────────────────────────────────────────────
-- 157: 기본소득 (자산 백분위 차등 지급)
-- 어드민이 구간 (% threshold) 과 금액 지정 → 일괄 지급 + 감사 로그
-- 같은 날 중복 지급 자동 차단.
-- ──────────────────────────────────────────────

-- 지급 이벤트 로그
create table if not exists public.basic_income_events (
  id bigserial primary key,
  paid_at timestamptz not null default now(),
  paid_by uuid not null references auth.users(id),
  -- 구간 정의: [{ "pct": 50, "amount": 30 }, { "pct": 80, "amount": 15 }, { "pct": 100, "amount": 5 }]
  -- pct 는 percent_rank 누적 컷오프 (오름차순). 예) 0~50%, 50~80%, 80~100%.
  tiers jsonb not null,
  total_recipients int not null default 0,
  total_paid numeric not null default 0,
  announcement_id bigint references public.site_announcements(id) on delete set null,
  note text
);
create index if not exists basic_income_events_paid_at_idx
  on public.basic_income_events(paid_at desc);

alter table public.basic_income_events enable row level security;

drop policy if exists "basic_income_events admin read" on public.basic_income_events;
create policy "basic_income_events admin read"
  on public.basic_income_events for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
-- INSERT 는 RPC (security definer) 안에서만 — 직접 client INSERT 차단

-- ── 미리보기 ─────────────────────────────────
-- p_tiers : jsonb array. 각 원소 { pct: 누적컷오프(0-100), amount: 지급액 }
-- 반환: 구간별 인원 수 + 지급액
drop function if exists public.preview_basic_income(jsonb);
create or replace function public.preview_basic_income(p_tiers jsonb)
returns table(tier_idx int, pct_from numeric, pct_to numeric, amount numeric, recipients int, subtotal numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_admin boolean;
begin
  if v_caller_id is null then raise exception '로그인 필요' using errcode = '28000'; end if;
  select coalesce(is_admin, false) into v_is_admin from public.profiles where id = v_caller_id;
  if not coalesce(v_is_admin, false) then raise exception '어드민만 가능' using errcode = '42501'; end if;

  return query
  with ranked as (
    select
      r.id,
      percent_rank() over (order by r.total_wealth asc, r.id) * 100 as pct_rank
    from public.user_wealth_ranking r
    where r.display_name is not null
  ),
  tiers_expanded as (
    select
      (idx - 1)::int as tier_idx,
      coalesce(lag((t->>'pct')::numeric) over (order by idx), 0) as pct_from,
      (t->>'pct')::numeric as pct_to,
      (t->>'amount')::numeric as amount
    from jsonb_array_elements(p_tiers) with ordinality as e(t, idx)
  )
  select
    te.tier_idx,
    te.pct_from,
    te.pct_to,
    te.amount,
    count(r.id)::int as recipients,
    (count(r.id) * te.amount)::numeric as subtotal
  from tiers_expanded te
  left join ranked r
    on (te.pct_from = 0 and r.pct_rank >= 0 and r.pct_rank <= te.pct_to)
    or (te.pct_from > 0 and r.pct_rank > te.pct_from and r.pct_rank <= te.pct_to)
  group by te.tier_idx, te.pct_from, te.pct_to, te.amount
  order by te.tier_idx;
end;
$$;
grant execute on function public.preview_basic_income(jsonb) to authenticated;

-- ── 실제 지급 ─────────────────────────────────
-- 같은 날 중복 차단. 트랜잭션 안에서 분류 → mlbg_balance += amount.
drop function if exists public.distribute_basic_income(jsonb, bigint, text);
create or replace function public.distribute_basic_income(
  p_tiers jsonb,
  p_announcement_id bigint default null,
  p_note text default null
)
returns table(out_total_recipients int, out_total_paid numeric, out_event_id bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_admin boolean;
  v_event_id bigint;
  v_total_recipients int := 0;
  v_total_paid numeric := 0;
begin
  if v_caller_id is null then raise exception '로그인 필요' using errcode = '28000'; end if;
  select coalesce(is_admin, false) into v_is_admin from public.profiles where id = v_caller_id;
  if not coalesce(v_is_admin, false) then raise exception '어드민만 가능' using errcode = '42501'; end if;

  if exists (select 1 from public.basic_income_events where paid_at::date = current_date) then
    raise exception '오늘 이미 기본소득이 지급됐습니다 (같은 날 중복 방지)';
  end if;

  -- 분류 + 지급. CTE 안에서 update 후 결과 카운트.
  with ranked as (
    select
      r.id,
      percent_rank() over (order by r.total_wealth asc, r.id) * 100 as pct_rank
    from public.user_wealth_ranking r
    where r.display_name is not null
  ),
  tiers_expanded as (
    select
      coalesce(lag((t->>'pct')::numeric) over (order by idx), 0) as pct_from,
      (t->>'pct')::numeric as pct_to,
      (t->>'amount')::numeric as amount
    from jsonb_array_elements(p_tiers) with ordinality as e(t, idx)
  ),
  user_amounts as (
    select r.id as user_id, te.amount
    from ranked r
    join tiers_expanded te
      on (te.pct_from = 0 and r.pct_rank >= 0 and r.pct_rank <= te.pct_to)
      or (te.pct_from > 0 and r.pct_rank > te.pct_from and r.pct_rank <= te.pct_to)
    where te.amount > 0
  ),
  upd as (
    update public.profiles p
    set mlbg_balance = coalesce(p.mlbg_balance, 0) + ua.amount
    from user_amounts ua
    where p.id = ua.user_id
    returning ua.amount
  )
  select count(*)::int, coalesce(sum(amount), 0) into v_total_recipients, v_total_paid from upd;

  insert into public.basic_income_events (paid_by, tiers, total_recipients, total_paid, announcement_id, note)
  values (v_caller_id, p_tiers, v_total_recipients, v_total_paid, p_announcement_id, p_note)
  returning id into v_event_id;

  return query select v_total_recipients, v_total_paid, v_event_id;
end;
$$;
grant execute on function public.distribute_basic_income(jsonb, bigint, text) to authenticated;

comment on table public.basic_income_events is '기본소득 지급 이벤트 — 어드민이 자산 백분위 기반으로 차등 지급한 기록.';

notify pgrst, 'reload schema';
