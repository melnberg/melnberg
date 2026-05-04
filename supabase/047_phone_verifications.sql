-- ──────────────────────────────────────────────
-- 047: 휴대폰 인증 (이메일 가입 시 본인 확인)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

create table if not exists public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  phone text not null,                -- 숫자만 11자리 (010xxxxxxxx)
  code_hash text not null,            -- bcrypt 가 아니라 단순 sha256(salt + code) — 5분 TTL 이라 충분
  expires_at timestamptz not null,
  verified_at timestamptz,            -- verify-code 성공 시각
  consumed_at timestamptz,            -- 가입 완료에 사용된 시각 (재사용 방지)
  attempts int not null default 0,    -- 잘못된 코드 입력 횟수
  created_at timestamptz not null default now()
);

create index if not exists phone_verifications_phone_idx
  on public.phone_verifications(phone, created_at desc);
create index if not exists phone_verifications_phone_recent_idx
  on public.phone_verifications(phone) where verified_at is not null and consumed_at is null;

-- 같은 폰번호로 시간당 발송 제한 카운트용
create or replace function public.recent_phone_send_count(p_phone text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.phone_verifications
  where phone = p_phone and created_at > now() - interval '1 hour';
$$;

grant execute on function public.recent_phone_send_count(text) to anon, authenticated;

-- RLS — 직접 접근 차단. 모든 작업은 service_role API 라우트에서만
alter table public.phone_verifications enable row level security;
-- (정책 없음 = 모두 거부, service_role 만 우회 가능)

comment on table public.phone_verifications is '휴대폰 인증 코드. 이메일 가입 본인 확인용. 5분 TTL.';
