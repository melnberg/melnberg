-- ──────────────────────────────────────────────
-- 006: 결제 신청 플로우 (pending → submitted → paid)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- 1. 입금자명 컬럼 (사용자가 결제 후 입력)
alter table public.payments
  add column if not exists payer_name text;

-- 2. status 값 확장 (기존: paid/refunded/cancelled → +pending, +submitted)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'payments_status_check' and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments drop constraint payments_status_check;
  end if;
  alter table public.payments
    add constraint payments_status_check
    check (status in ('pending', 'submitted', 'paid', 'refunded', 'cancelled'));
end $$;

-- 3. RLS — 사용자가 자기 자신의 pending 결제건 생성 가능
--    (등급 부여 필드는 admin만 채울 수 있게 null 강제)
drop policy if exists "Users can create own pending payments" on public.payments;
create policy "Users can create own pending payments"
  on public.payments for insert with check (
    auth.uid() = user_id
    and status in ('pending', 'submitted')
    and tier_granted is null
    and tier_period_label is null
    and tier_expires_at is null
  );

-- 4. RLS — 사용자가 자기 결제건의 pending → submitted 전환 가능
--    (status를 paid 등으로 직접 못 올리도록 with check로 제한)
drop policy if exists "Users can submit own pending payments" on public.payments;
create policy "Users can submit own pending payments"
  on public.payments for update using (
    auth.uid() = user_id and status in ('pending', 'submitted')
  ) with check (
    auth.uid() = user_id
    and status in ('pending', 'submitted')
    and tier_granted is null
    and tier_period_label is null
    and tier_expires_at is null
  );

-- 5. 사용자가 자기 pending 결제건 삭제 가능 (실수로 만든 경우 취소)
drop policy if exists "Users can delete own pending payments" on public.payments;
create policy "Users can delete own pending payments"
  on public.payments for delete using (
    auth.uid() = user_id and status = 'pending'
  );
