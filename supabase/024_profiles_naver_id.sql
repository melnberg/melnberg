-- ──────────────────────────────────────────────
-- 024: 카페 유료회원 자동 연동
-- 목적: 카페 가입한 네이버ID 입력 시 → 유료회원 자동 인식
-- 1) profiles.naver_id 컬럼
-- 2) cafe_paid_members 마스터 (사전 적재) — 네이버ID + 카페 닉네임
-- 3) 가입 트리거 업데이트 — naver_id 매치되면 tier='paid' 자동 부여
-- ──────────────────────────────────────────────

-- 1) profiles에 naver_id 추가
alter table public.profiles
  add column if not exists naver_id text;

create index if not exists profiles_naver_id_idx on public.profiles (naver_id) where naver_id is not null;

-- 2) 카페 유료회원 마스터 — 어드민이 사전 적재
create table if not exists public.cafe_paid_members (
  naver_id text primary key,
  cafe_nickname text,
  registered_at timestamptz not null default now(),
  note text
);

alter table public.cafe_paid_members enable row level security;

drop policy if exists "Admins can manage cafe paid members" on public.cafe_paid_members;
create policy "Admins can manage cafe paid members"
  on public.cafe_paid_members for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- 3) 가입 트리거 업데이트 — naver_id 처리 + 유료회원 자동 매칭
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_naver_id text := nullif(new.raw_user_meta_data->>'naver_id', '');
  v_is_paid boolean := false;
begin
  -- 카페 유료회원 매칭 (네이버ID 정확 일치)
  if v_naver_id is not null then
    select true into v_is_paid from public.cafe_paid_members where naver_id = v_naver_id;
  end if;

  insert into public.profiles (id, display_name, naver_id, tier, tier_expires_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_naver_id,
    case when v_is_paid then 'paid' else 'free' end,
    case when v_is_paid then '2099-12-31'::timestamptz else null end
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    naver_id = coalesce(excluded.naver_id, public.profiles.naver_id),
    tier = case when v_is_paid then 'paid' else public.profiles.tier end,
    tier_expires_at = case when v_is_paid then '2099-12-31'::timestamptz else public.profiles.tier_expires_at end;
  return new;
end;
$$;

-- 4) 기존 가입 회원 중 카페 유료회원과 매칭되는 사람 일괄 업그레이드 RPC (어드민이 호출)
create or replace function public.sync_cafe_paid_tier()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'admin only';
  end if;
  with matched as (
    update public.profiles p
      set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
      where p.naver_id is not null
        and exists (select 1 from public.cafe_paid_members c where c.naver_id = p.naver_id)
        and p.tier <> 'paid'
      returning 1
  )
  select count(*) into v_count from matched;
  return v_count;
end;
$$;

grant execute on function public.sync_cafe_paid_tier() to authenticated;

comment on column public.profiles.naver_id is '카페 가입한 네이버 아이디. 카페 유료회원 매칭 키.';
comment on table public.cafe_paid_members is '카페 유료회원 마스터. 어드민이 사전 적재. naver_id 매칭 시 가입자 자동 유료 처리.';
comment on function public.sync_cafe_paid_tier is '기존 회원 중 카페 유료회원과 naver_id 매칭되는 사람 일괄 paid 전환 (어드민 전용).';
