-- ──────────────────────────────────────────────
-- 114: 정당 본부 분양가 2000 일시 상향
-- 110 의 20 mlbg 가 너무 낮아 이벤트성으로 2000 mlbg 로 일시 상향.
-- 일 수익은 1 유지 (회수 기간 ↑).
-- ──────────────────────────────────────────────

update public.factory_locations
  set occupy_price = 2000
  where brand in ('party_dem', 'party_ppl', 'party_jhs', 'party_ref', 'party_jin', 'party_basic', 'party_sd');

notify pgrst, 'reload schema';
