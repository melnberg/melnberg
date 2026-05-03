-- ──────────────────────────────────────────────
-- 018: 아파트 단지 마스터 + 좌표 (카카오 지오코딩 결과 저장)
-- 목적: 아파트토론방의 지도 핀 + 단지별 식별용
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

create table if not exists public.apt_master (
  id bigserial primary key,
  apt_nm text not null,             -- 단지명 (apt_trades.apt_nm과 동일)
  dong text,                        -- 법정동 (apt_trades.dong)
  lawd_cd text not null,            -- 시군구코드 (apt_trades.lawd_cd)
  lat double precision,             -- 위도
  lng double precision,             -- 경도
  geocoded_address text,            -- 카카오가 반환한 주소 (디버깅·수동 보정용)
  geocoded_place_name text,         -- 카카오가 반환한 장소명
  geocoded_category text,           -- 카카오 카테고리 (검증용)
  geocoded_at timestamptz,
  geocode_failed boolean default false,
  geocode_failure_reason text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (apt_nm, dong, lawd_cd)
);

create index if not exists apt_master_lawd_cd_idx on public.apt_master (lawd_cd);
create index if not exists apt_master_dong_idx on public.apt_master (dong);
create index if not exists apt_master_apt_nm_idx on public.apt_master (apt_nm);
-- 좌표 있는 단지만 지도 표시용 부분 인덱스
create index if not exists apt_master_geo_idx
  on public.apt_master (lat, lng)
  where lat is not null and lng is not null;

-- 갱신 시각 자동 갱신 트리거
create or replace function public.touch_apt_master_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists apt_master_touch on public.apt_master;
create trigger apt_master_touch
  before update on public.apt_master
  for each row execute function public.touch_apt_master_updated_at();

-- RLS — 누구나 읽기 가능 (지도 핀 표시는 비회원도 봄)
-- 쓰기는 service_role만 (지오코딩 스크립트 + 어드민)
alter table public.apt_master enable row level security;

drop policy if exists "Anyone can read apt_master" on public.apt_master;
create policy "Anyone can read apt_master"
  on public.apt_master for select using (true);

drop policy if exists "Admins can write apt_master" on public.apt_master;
create policy "Admins can write apt_master"
  on public.apt_master for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

comment on table public.apt_master is '단지 마스터 — 카카오 지오코딩으로 좌표 매핑. 아파트토론방 지도 핀 + 향후 단지별 데이터의 anchor.';
