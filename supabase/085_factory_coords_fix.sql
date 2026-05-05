-- ──────────────────────────────────────────────
-- 085: 공장 좌표 보정 — 하이닉스 이천·청주, 삼성 평택
-- 083 의 좌표가 실제 공장 위치와 어긋남.
-- ──────────────────────────────────────────────

update public.factory_locations
   set lat = 37.2245, lng = 127.4680
 where brand = 'hynix' and name like '%이천%';

update public.factory_locations
   set lat = 36.6286, lng = 127.4083
 where brand = 'hynix' and name like '%청주%';

update public.factory_locations
   set lat = 37.0033, lng = 127.0790
 where brand = 'samsung' and name like '%평택%';
