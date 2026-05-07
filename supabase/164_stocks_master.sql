-- ──────────────────────────────────────────────
-- 164: 주식 토론방 — 종목 마스터 + 글-종목 연결
--
-- 옵션 B Phase 1: 시세 없이 종목별 토론.
-- /stocks = 종목 목록, /stocks/[code] = 종목 토론, /stocks/[code]/[postId] = 글
-- ──────────────────────────────────────────────

create table if not exists public.stocks (
  code text primary key,             -- 6자리 종목 코드 ('005930' 등)
  name text not null,
  market text not null check (market in ('KOSPI', 'KOSDAQ')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.stocks enable row level security;
drop policy if exists "stocks readable by all" on public.stocks;
create policy "stocks readable by all" on public.stocks for select using (true);
drop policy if exists "stocks admin write" on public.stocks;
create policy "stocks admin write" on public.stocks for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- posts 에 stock_code 추가 — category='stocks' 일 때만 채움
alter table public.posts add column if not exists stock_code text references public.stocks(code) on delete set null;
create index if not exists posts_stock_code_idx on public.posts(stock_code, created_at desc) where stock_code is not null and deleted_at is null;

-- 시드 — KOSPI 시총상위 + KOSDAQ 시총상위 (2026-05 기준 대략)
insert into public.stocks (code, name, market) values
  -- KOSPI 25
  ('005930', '삼성전자', 'KOSPI'),
  ('000660', 'SK하이닉스', 'KOSPI'),
  ('373220', 'LG에너지솔루션', 'KOSPI'),
  ('207940', '삼성바이오로직스', 'KOSPI'),
  ('005380', '현대차', 'KOSPI'),
  ('035420', 'NAVER', 'KOSPI'),
  ('035720', '카카오', 'KOSPI'),
  ('005490', '포스코홀딩스', 'KOSPI'),
  ('068270', '셀트리온', 'KOSPI'),
  ('000270', '기아', 'KOSPI'),
  ('012450', '한화에어로스페이스', 'KOSPI'),
  ('034020', '두산에너빌리티', 'KOSPI'),
  ('105560', 'KB금융', 'KOSPI'),
  ('055550', '신한지주', 'KOSPI'),
  ('086790', '하나금융지주', 'KOSPI'),
  ('138040', '메리츠금융지주', 'KOSPI'),
  ('006400', '삼성SDI', 'KOSPI'),
  ('051910', 'LG화학', 'KOSPI'),
  ('323410', '카카오뱅크', 'KOSPI'),
  ('012330', '현대모비스', 'KOSPI'),
  ('017670', 'SK텔레콤', 'KOSPI'),
  ('033780', 'KT&G', 'KOSPI'),
  ('066570', 'LG전자', 'KOSPI'),
  ('028260', '삼성물산', 'KOSPI'),
  ('003670', '포스코퓨처엠', 'KOSPI'),
  -- KOSDAQ 10
  ('028300', 'HLB', 'KOSDAQ'),
  ('196170', '알테오젠', 'KOSDAQ'),
  ('247540', '에코프로비엠', 'KOSDAQ'),
  ('086520', '에코프로', 'KOSDAQ'),
  ('058470', '리노공업', 'KOSDAQ'),
  ('091990', '셀트리온헬스케어', 'KOSDAQ'),
  ('095340', 'ISC', 'KOSDAQ'),
  ('078340', '컴투스', 'KOSDAQ'),
  ('357780', '솔브레인', 'KOSDAQ'),
  ('357390', '엠디바이스', 'KOSDAQ')
on conflict (code) do nothing;

comment on table public.stocks is '주식 토론방 종목 마스터 — 사용자 글이 종목별로 그룹화. 시세는 별도 테이블 (Phase 2).';

notify pgrst, 'reload schema';
