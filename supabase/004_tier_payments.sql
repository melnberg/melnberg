-- ──────────────────────────────────────────────
-- 004: 회원 등급 + 결제 기록
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- 1. profiles에 등급 + 만료일 컬럼
alter table public.profiles
  add column if not exists tier text default 'free' not null;

alter table public.profiles
  add column if not exists tier_expires_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public' and table_name = 'profiles' and constraint_name = 'profiles_tier_check'
  ) then
    alter table public.profiles
      add constraint profiles_tier_check check (tier in ('free', 'paid'));
  end if;
end $$;

-- 2. payments 테이블 (결제 이력)
create table if not exists public.payments (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null,            -- 'short-consult' | 'mid-consult' | 'new-membership' | 'renewal'
  product_name text not null,          -- 표시용 이름
  amount integer not null,             -- 원
  pg_provider text,                    -- 'kakaopay' | 'naverpay' | 'manual' (수동 등록)
  pg_payment_id text,                  -- PG사가 발급한 결제 ID
  status text default 'paid' not null, -- 'paid' | 'refunded' | 'cancelled'
  tier_granted text,                   -- 이 결제로 부여된 등급 ('free' | 'paid')
  tier_period_label text,              -- '2026Q2', '2026Q3' 등 표시용
  tier_expires_at timestamp with time zone,
  note text,                           -- 어드민 메모
  paid_at timestamp with time zone default now() not null,
  created_at timestamp with time zone default now() not null
);

create index if not exists payments_user_id_idx on public.payments (user_id, paid_at desc);
create index if not exists payments_status_idx on public.payments (status);

-- 3. RLS
alter table public.payments enable row level security;

drop policy if exists "Users can view own payments" on public.payments;
create policy "Users can view own payments"
  on public.payments for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can insert payments" on public.payments;
create policy "Admins can insert payments"
  on public.payments for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can update payments" on public.payments;
create policy "Admins can update payments"
  on public.payments for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can delete payments" on public.payments;
create policy "Admins can delete payments"
  on public.payments for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- 4. 어드민이 다른 회원의 profile.tier 수정 가능하게 RLS 보강
drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
  on public.profiles for update using (
    auth.uid() = id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- 5. 어드민이 모든 회원 조회 가능 (이미 모두 select 가능하지만 명시)
-- profiles의 select 정책은 "Profiles are viewable by everyone"로 이미 모두 공개됨

-- 6. 만료된 등급 자동 free로 내리는 함수 (cron으로 호출 권장)
create or replace function public.expire_tiers()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set tier = 'free', tier_expires_at = null
  where tier = 'paid'
    and tier_expires_at is not null
    and tier_expires_at < now();
end;
$$;
