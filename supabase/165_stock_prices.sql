-- ──────────────────────────────────────────────
-- 165: 주식 일별 시세 (close, change, volume)
-- 매일 KST 16시 (= UTC 07시) cron 으로 Naver 금융에서 fetch.
-- ──────────────────────────────────────────────

create table if not exists public.stock_prices (
  code text not null references public.stocks(code) on delete cascade,
  trade_date date not null,
  close numeric not null,                  -- 종가
  change_amount numeric,                   -- 전일 대비
  change_pct numeric,                      -- % (양수=상승, 음수=하락)
  volume bigint,
  updated_at timestamptz not null default now(),
  primary key (code, trade_date)
);

create index if not exists stock_prices_recent_idx
  on public.stock_prices(code, trade_date desc);

alter table public.stock_prices enable row level security;
drop policy if exists "stock_prices readable by all" on public.stock_prices;
create policy "stock_prices readable by all" on public.stock_prices for select using (true);
-- INSERT/UPDATE 는 service_role 만 (cron)

-- 최근 시세 view — 종목별 가장 최신 1행
create or replace view public.stocks_with_latest_price
with (security_invoker = true)
as
select
  s.code, s.name, s.market, s.active,
  lp.trade_date as latest_trade_date,
  lp.close as latest_close,
  lp.change_amount as latest_change_amount,
  lp.change_pct as latest_change_pct,
  lp.volume as latest_volume
from public.stocks s
left join lateral (
  select trade_date, close, change_amount, change_pct, volume
  from public.stock_prices
  where code = s.code
  order by trade_date desc
  limit 1
) lp on true;

grant select on public.stocks_with_latest_price to anon, authenticated;

comment on table public.stock_prices is '주식 일별 종가 — 매일 cron 으로 Naver 금융에서 fetch';

notify pgrst, 'reload schema';
