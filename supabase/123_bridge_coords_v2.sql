-- ──────────────────────────────────────────────
-- 123: 한강 다리 좌표 정밀화 (다리 중간점 기준)
-- 121 의 추정값을 일반 지도 자료 기반 다리 중간 좌표로 갱신.
-- 정확도 부족하면 카카오맵에서 핀 우클릭으로 좌표 확인 후 개별 UPDATE 가능.
-- ──────────────────────────────────────────────

update public.factory_locations set lat = 37.5723, lng = 126.8517 where brand = 'bridge' and name = '가양대교';
update public.factory_locations set lat = 37.5557, lng = 126.8915 where brand = 'bridge' and name = '성산대교';
update public.factory_locations set lat = 37.5454, lng = 126.9006 where brand = 'bridge' and name = '양화대교';
update public.factory_locations set lat = 37.5372, lng = 126.9266 where brand = 'bridge' and name = '서강대교';
update public.factory_locations set lat = 37.5377, lng = 126.9418 where brand = 'bridge' and name = '마포대교';
update public.factory_locations set lat = 37.5288, lng = 126.9533 where brand = 'bridge' and name = '원효대교';
update public.factory_locations set lat = 37.5191, lng = 126.9590 where brand = 'bridge' and name = '한강대교';
update public.factory_locations set lat = 37.5152, lng = 126.9854 where brand = 'bridge' and name = '동작대교';
update public.factory_locations set lat = 37.5145, lng = 126.9962 where brand = 'bridge' and name = '반포대교';
update public.factory_locations set lat = 37.5252, lng = 127.0044 where brand = 'bridge' and name = '한남대교';
update public.factory_locations set lat = 37.5403, lng = 127.0287 where brand = 'bridge' and name = '동호대교';
update public.factory_locations set lat = 37.5404, lng = 127.0399 where brand = 'bridge' and name = '성수대교';
update public.factory_locations set lat = 37.5418, lng = 127.0529 where brand = 'bridge' and name = '영동대교';
update public.factory_locations set lat = 37.5277, lng = 127.0729 where brand = 'bridge' and name = '청담대교';
update public.factory_locations set lat = 37.5145, lng = 127.0888 where brand = 'bridge' and name = '잠실대교';
update public.factory_locations set lat = 37.5260, lng = 127.1108 where brand = 'bridge' and name = '올림픽대교';
update public.factory_locations set lat = 37.5395, lng = 127.1109 where brand = 'bridge' and name = '광진교';
update public.factory_locations set lat = 37.5413, lng = 127.1240 where brand = 'bridge' and name = '천호대교';

notify pgrst, 'reload schema';
