-- ──────────────────────────────────────────────
-- 112: 정당 본부 주소·좌표 정정
-- 110 의 핀 위치가 국회의사당 북쪽 (의사당 부지 안) 으로 잘못 찍혀있음.
-- 정확한 주소는 국회의사당 남쪽 영등포구 국회대로 일대 주거·상업지역.
--
-- 사용자 제공 정확 주소:
--   더불어민주당: 영등포구 국회대로68길 7 민주당사
--   국민의힘:     영등포구 국회대로74길 12
--   조국혁신당:   영등포구 국회대로70길 12 대산빌딩 8층 805호
--   기본소득당:   영등포구 국회대로70길 15-1 극동VIP빌딩 3층 302호
--   사회민주당:   영등포구 국회대로72길 22 가든빌딩 301호
--   (개혁신당 / 진보당 은 사용자 제공값 그대로 유지)
-- ──────────────────────────────────────────────

update public.factory_locations
  set address = '서울 영등포구 국회대로68길 7 민주당사',
      lat = 37.5288, lng = 126.9154
  where brand = 'party_dem';

update public.factory_locations
  set address = '서울 영등포구 국회대로74길 12',
      lat = 37.5295, lng = 126.9148
  where brand = 'party_ppl';

update public.factory_locations
  set address = '서울 영등포구 국회대로70길 12 대산빌딩 8층 805호',
      lat = 37.5290, lng = 126.9152
  where brand = 'party_jhs';

update public.factory_locations
  set address = '서울 영등포구 국회대로70길 15-1 극동VIP빌딩 3층 302호',
      lat = 37.5288, lng = 126.9151
  where brand = 'party_basic';

update public.factory_locations
  set address = '서울 영등포구 국회대로72길 22 가든빌딩 301호',
      lat = 37.5292, lng = 126.9150
  where brand = 'party_sd';

-- 진보당 — 정확 주소 미공개 (국회대로 인근). 같은 권역 추정 좌표로 보정.
update public.factory_locations
  set lat = 37.5293, lng = 126.9152
  where brand = 'party_jin';

notify pgrst, 'reload schema';
