-- ──────────────────────────────────────────────
-- 073: 핀에 표시할 평당가 (국토부 실거래 기반)
-- - apt_trades 24개월 합산: sum(deal_amount) / sum(excl_use_ar × 0.3025)
-- - apt_trades 는 admin RLS 라 materialized view 로 한번 적재 후 anon 공개
-- - apt_master_with_listing 에 pyeong_price 컬럼 추가 (home-pins 에서 사용)
-- ──────────────────────────────────────────────

drop materialized view if exists public.apt_pyeong_avg cascade;

create materialized view public.apt_pyeong_avg as
  select
    apt_nm,
    lawd_cd,
    coalesce(dong, '') as dong_norm,
    -- 만원/평. 합산 비율이 평균비율보다 통계적으로 안정.
    round(sum(deal_amount)::numeric / nullif(sum(excl_use_ar) * 0.3025, 0), 0)::int as pyeong_price,
    count(*) as trade_count,
    max(deal_date) as last_trade_date
  from public.apt_trades
  where deal_date >= (current_date - interval '24 months')
    and excl_use_ar > 0
    and deal_amount > 0
  group by apt_nm, lawd_cd, coalesce(dong, '');

create unique index if not exists apt_pyeong_avg_natural
  on public.apt_pyeong_avg (apt_nm, lawd_cd, dong_norm);

grant select on public.apt_pyeong_avg to anon, authenticated;

-- 갱신 함수 — 어드민이 SQL Editor 에서 직접 호출하거나, 추후 cron 으로 매일 실행
create or replace function public.refresh_apt_pyeong_avg()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.apt_pyeong_avg;
end;
$$;

-- 비동시 갱신 (인덱스 없을 때 첫 호출용 fallback)
create or replace function public.refresh_apt_pyeong_avg_initial()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view public.apt_pyeong_avg;
end;
$$;

-- apt_master_with_listing 뷰 재정의 — pyeong_price 추가
create or replace view public.apt_master_with_listing as
  select
    am.*,
    l.price as listing_price,
    l.listed_at as listed_at,
    l.description as listing_description,
    pa.pyeong_price as pyeong_price
  from public.apt_master am
  left join public.apt_listings l on l.apt_id = am.id
  left join public.apt_pyeong_avg pa
    on pa.apt_nm = am.apt_nm
   and pa.lawd_cd = am.lawd_cd
   and pa.dong_norm = coalesce(am.dong, '');

grant select on public.apt_master_with_listing to anon, authenticated;

comment on materialized view public.apt_pyeong_avg is
  '국토부 실거래 24개월 평당가 (만원/평). 핀 라벨 표시용. refresh_apt_pyeong_avg() 로 갱신.';
