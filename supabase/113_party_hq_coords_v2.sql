-- ──────────────────────────────────────────────
-- 113: 정당 본부 좌표 v2 — 국회의사당 '동쪽' 국회대로 블록으로 이동
-- 112 의 좌표가 여전히 의사당 부지 안 (서쪽) 으로 찍힘.
-- 실제 국회대로 6X길~7X길 당사 건물들은 의사당 동쪽 (~126.919-126.921) 위치.
-- 길번호가 클수록 동쪽: 68길 → 70길 → 72길 → 74길.
-- ──────────────────────────────────────────────

update public.factory_locations
  set lat = 37.5292, lng = 126.9189
  where brand = 'party_dem';      -- 국회대로68길 7

update public.factory_locations
  set lat = 37.5286, lng = 126.9203
  where brand = 'party_ppl';      -- 국회대로74길 12

update public.factory_locations
  set lat = 37.5290, lng = 126.9194
  where brand = 'party_jhs';      -- 국회대로70길 12

update public.factory_locations
  set lat = 37.5288, lng = 126.9195
  where brand = 'party_basic';    -- 국회대로70길 15-1 (조국 옆 건물)

update public.factory_locations
  set lat = 37.5288, lng = 126.9199
  where brand = 'party_sd';       -- 국회대로72길 22

update public.factory_locations
  set lat = 37.5290, lng = 126.9197
  where brand = 'party_jin';      -- 진보당 (국회대로 인근, 추정)

notify pgrst, 'reload schema';
