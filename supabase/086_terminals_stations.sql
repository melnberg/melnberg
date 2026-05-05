-- ──────────────────────────────────────────────
-- 086: 터미널·역 분양 추가
-- 터미널 (동서울/센트럴시티/남부): 분양가 10, 일 수익 1
-- 역 (서울/수서/용산/청량리): 분양가 30, 일 수익 2
-- ──────────────────────────────────────────────

alter table public.factory_locations
  drop constraint if exists factory_locations_brand_check;
alter table public.factory_locations
  add constraint factory_locations_brand_check
  check (brand in ('hynix', 'samsung', 'costco', 'union', 'cargo', 'terminal', 'station'));

insert into public.factory_locations (brand, name, address, lat, lng, occupy_price, daily_income) values
  ('terminal', '동서울터미널',           '서울 광진구 강변역로 50',     37.5363, 127.0950, 10, 1),
  ('terminal', '센트럴시티 (고속터미널)', '서울 서초구 신반포로 194',    37.5046, 127.0044, 10, 1),
  ('terminal', '남부터미널',             '서울 서초구 효령로 292',      37.4848, 127.0153, 10, 1),
  ('station',  '서울역',                 '서울 용산구 한강대로 405',    37.5546, 126.9706, 30, 2),
  ('station',  '수서역',                 '서울 강남구 밤고개로 99',     37.4868, 127.1024, 30, 2),
  ('station',  '용산역',                 '서울 용산구 한강대로23길 55', 37.5299, 126.9648, 30, 2),
  ('station',  '청량리역',               '서울 동대문구 왕산로 214',    37.5803, 127.0467, 30, 2)
on conflict do nothing;
