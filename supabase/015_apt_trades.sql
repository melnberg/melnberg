-- ──────────────────────────────────────────────
-- 015: 국토부 아파트매매 실거래가 적재 테이블
-- 목적: AI 답변 시 "카페 분석 + 최근 시세" 함께 제공
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- 1. 거래 원본 테이블 (국토부 응답 그대로 적재)
create table if not exists public.apt_trades (
  id bigserial primary key,
  apt_seq text,                            -- 단지일련번호 (국토부 식별자)
  apt_nm text not null,                    -- 단지명
  apt_dong text,                           -- 단지 내 동 (예: "101동")
  sgg_cd text not null,                    -- 시군구코드 5자리 (LAWD_CD)
  umd_cd text,                             -- 법정동코드
  umd_nm text,                             -- 법정동명
  jibun text,                              -- 지번
  road_nm text,                            -- 도로명
  excl_use_ar numeric(8,2) not null,       -- 전용면적 (m²)
  floor int,                               -- 층
  build_year int,                          -- 건축년도
  deal_date date not null,                 -- 계약일
  deal_amount bigint not null,             -- 거래금액 (만원 단위)
  dealing_gbn text,                        -- '중개거래' | '직거래' | NULL
  cdeal_type text,                         -- 'O' = 해제됨, NULL/'' = 정상
  cdeal_day date,                          -- 해제 발생일
  rgst_date date,                          -- 등기일자
  sler_gbn text,                           -- 매도자 ('개인' | '법인' 등)
  buyer_gbn text,                          -- 매수자
  ingested_at timestamp with time zone default now() not null
);

-- 자연키로 dedup (같은 거래 중복 적재 방지)
create unique index if not exists apt_trades_natural_key
  on public.apt_trades (apt_nm, jibun, excl_use_ar, floor, deal_date, deal_amount, coalesce(apt_dong, ''));

create index if not exists apt_trades_deal_date_idx on public.apt_trades (deal_date desc);
create index if not exists apt_trades_apt_seq_idx on public.apt_trades (apt_seq) where apt_seq is not null;
create index if not exists apt_trades_apt_nm_idx on public.apt_trades (apt_nm);
create index if not exists apt_trades_sgg_cd_idx on public.apt_trades (sgg_cd);

-- 2. 단지·평형 대표값 view (필터링·추천용)
-- 정책:
--   - 최근 6개월 거래
--   - 직거래 제외 (가족 간 증여성 위험)
--   - 해제된 거래 제외
--   - 1층 제외 (시세 왜곡)
--   - 거래 3건 이상일 때만 산출 (소수 표본 신뢰도 낮음)
--   - 전용면적 5㎡ 단위 그룹핑 (84.95, 84.99 같은 미세 차이 통합)
--   - 통계량: 중앙값 (이상치 강건)

create or replace view public.apt_representative_price as
with valid as (
  select
    apt_seq,
    apt_nm,
    sgg_cd,
    umd_nm,
    floor(excl_use_ar / 5) * 5 as area_group,  -- 5㎡ bucket
    deal_date,
    deal_amount,
    floor as floor_no
  from public.apt_trades
  where deal_date >= (current_date - interval '6 months')
    and (cdeal_type is null or cdeal_type = '')
    and (dealing_gbn is null or dealing_gbn <> '직거래')
    and (floor is null or floor <> 1)
)
select
  apt_seq,
  apt_nm,
  sgg_cd,
  umd_nm,
  area_group,
  count(*)::int as trade_count,
  (percentile_cont(0.5) within group (order by deal_amount))::bigint as median_amount,
  min(deal_amount) as min_amount,
  max(deal_amount) as max_amount,
  max(deal_date) as last_deal_date
from valid
group by apt_seq, apt_nm, sgg_cd, umd_nm, area_group
having count(*) >= 3;

-- 3. RLS — 어드민만 직접 조회·수정. 검색은 별도 RPC 통해 노출 (다음 마이그레이션)
alter table public.apt_trades enable row level security;

drop policy if exists "Admins can read apt_trades" on public.apt_trades;
create policy "Admins can read apt_trades"
  on public.apt_trades for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admins can write apt_trades" on public.apt_trades;
create policy "Admins can write apt_trades"
  on public.apt_trades for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- 적재 스크립트는 service_role 키로 호출하므로 RLS 우회됨
-- 일반 클라이언트는 어드민이 아니면 접근 불가
