-- ──────────────────────────────────────────────
-- 125: 한강 다리 좌표 v3 — 사용자 제공 정확 좌표
-- 기존 18개 좌표 갱신 + 신규 7개 (강동/고덕토평/구리암사/잠실철교/월드컵/방화/행주) 추가.
-- ──────────────────────────────────────────────

update public.factory_locations set lat = 37.5191, lng = 126.9590 where brand = 'bridge' and name = '한강대교';
update public.factory_locations set lat = 37.5454, lng = 126.9006 where brand = 'bridge' and name = '양화대교';
update public.factory_locations set lat = 37.5528, lng = 126.8916 where brand = 'bridge' and name = '성산대교';
update public.factory_locations set lat = 37.5693, lng = 126.8610 where brand = 'bridge' and name = '가양대교';
update public.factory_locations set lat = 37.5370, lng = 126.9250 where brand = 'bridge' and name = '서강대교';
update public.factory_locations set lat = 37.5338, lng = 126.9371 where brand = 'bridge' and name = '마포대교';
update public.factory_locations set lat = 37.5270, lng = 126.9457 where brand = 'bridge' and name = '원효대교';
update public.factory_locations set lat = 37.5105, lng = 126.9818 where brand = 'bridge' and name = '동작대교';
update public.factory_locations set lat = 37.5157, lng = 126.9960 where brand = 'bridge' and name = '반포대교';
update public.factory_locations set lat = 37.5273, lng = 127.0129 where brand = 'bridge' and name = '한남대교';
update public.factory_locations set lat = 37.5362, lng = 127.0210 where brand = 'bridge' and name = '동호대교';
update public.factory_locations set lat = 37.5370, lng = 127.0349 where brand = 'bridge' and name = '성수대교';
update public.factory_locations set lat = 37.5302, lng = 127.0572 where brand = 'bridge' and name = '영동대교';
update public.factory_locations set lat = 37.5266, lng = 127.0645 where brand = 'bridge' and name = '청담대교';
update public.factory_locations set lat = 37.5244, lng = 127.0916 where brand = 'bridge' and name = '잠실대교';
update public.factory_locations set lat = 37.5324, lng = 127.1054 where brand = 'bridge' and name = '올림픽대교';
update public.factory_locations set lat = 37.5448, lng = 127.1131 where brand = 'bridge' and name = '광진교';
update public.factory_locations set lat = 37.5429, lng = 127.1118 where brand = 'bridge' and name = '천호대교';

-- 신규 7곳
insert into public.factory_locations (brand, name, address, lat, lng, occupy_price, daily_income) values
  ('bridge', '잠실철교',   '서울 송파구·광진구',   37.5291, 127.0986, 100, 5),
  ('bridge', '강동대교',   '서울 강동구·경기 구리', 37.5778, 127.1613, 100, 5),
  ('bridge', '고덕토평대교','서울 강동구·경기 구리', 37.5714, 127.1494, 100, 5),
  ('bridge', '구리암사대교','서울 강동구·경기 구리', 37.5699, 127.1314, 100, 5),
  ('bridge', '월드컵대교', '서울 영등포구·마포구', 37.5560, 126.8852, 100, 5),
  ('bridge', '방화대교',   '서울 강서구·경기 고양', 37.5885, 126.8274, 100, 5),
  ('bridge', '행주대교',   '서울 강서구·경기 고양', 37.5980, 126.8096, 100, 5)
on conflict do nothing;

notify pgrst, 'reload schema';
