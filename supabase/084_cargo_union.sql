-- ──────────────────────────────────────────────
-- 084: 화물연대 추가 (브랜드 'cargo'). 분양가 10, 일 수익 1 (금속노조와 동일).
-- ──────────────────────────────────────────────

alter table public.factory_locations
  drop constraint if exists factory_locations_brand_check;
alter table public.factory_locations
  add constraint factory_locations_brand_check
  check (brand in ('hynix', 'samsung', 'costco', 'union', 'cargo'));

insert into public.factory_locations (brand, name, address, lat, lng, occupy_price, daily_income) values
  ('cargo', '화물연대 본부',     '서울 영등포구 양평로21길 25',  37.5267, 126.8932, 10, 1),
  ('cargo', '화물연대 경기지부', '경기 의왕시 이미로 11',         37.3463, 126.9682, 10, 1),
  ('cargo', '화물연대 부산지부', '부산 사상구 사상로 312',         35.1525, 128.9817, 10, 1)
on conflict do nothing;
