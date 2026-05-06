-- ──────────────────────────────────────────────
-- 115: 공원·유원지 7곳 분양 추가
-- 서울 꿈의숲 / 서울숲 / 어린이대공원 / 롯데월드 / 과천 서울대공원 / 하늘공원 / 올림픽공원
-- 분양가 100, 일 수익 5 (시설 중상급)
-- ──────────────────────────────────────────────

alter table public.factory_locations
  drop constraint if exists factory_locations_brand_check;
alter table public.factory_locations
  add constraint factory_locations_brand_check
  check (brand in (
    'hynix', 'samsung', 'costco', 'union', 'cargo', 'terminal', 'station',
    'party_dem', 'party_ppl', 'party_jhs', 'party_ref', 'party_jin', 'party_basic', 'party_sd',
    'park'
  ));

insert into public.factory_locations (brand, name, address, lat, lng, occupy_price, daily_income) values
  ('park', '서울 꿈의숲',       '서울 강북구 월계로 173',         37.6202, 127.0407, 100, 5),
  ('park', '서울숲',             '서울 성동구 뚝섬로 273',         37.5443, 127.0376, 100, 5),
  ('park', '어린이대공원',       '서울 광진구 능동로 216',         37.5491, 127.0817, 100, 5),
  ('park', '롯데월드',           '서울 송파구 올림픽로 240',       37.5113, 127.0980, 100, 5),
  ('park', '과천 서울대공원',     '경기 과천시 대공원광장로 102',    37.4307, 127.0186, 100, 5),
  ('park', '하늘공원 (월드컵공원)', '서울 마포구 하늘공원로 95',     37.5722, 126.8857, 100, 5),
  ('park', '올림픽공원',         '서울 송파구 올림픽로 424',       37.5202, 127.1217, 100, 5)
on conflict do nothing;

-- list_struck_targets brand_label CASE 에 'park' 라벨 추가
create or replace function public.list_struck_targets()
returns table(
  asset_type text,
  asset_id bigint,
  asset_name text,
  brand_label text,
  occupier_id uuid,
  occupier_name text,
  occupier_balance numeric,
  default_pct numeric
)
language sql stable security definer set search_path = public as $$
  select
    'factory'::text as asset_type,
    f.id, f.name,
    case f.brand
      when 'hynix' then 'SK하이닉스'
      when 'samsung' then '삼성전자'
      when 'costco' then '코스트코'
      when 'union' then '금속노조'
      when 'cargo' then '화물연대'
      when 'terminal' then '터미널'
      when 'station' then '기차역'
      when 'party_dem' then '더불어민주당'
      when 'party_ppl' then '국민의힘'
      when 'party_jhs' then '조국혁신당'
      when 'party_ref' then '개혁신당'
      when 'party_jin' then '진보당'
      when 'party_basic' then '기본소득당'
      when 'party_sd' then '사회민주당'
      when 'park' then '공원·유원지'
      else '시설'
    end as brand_label,
    fo.user_id,
    p.display_name,
    coalesce(p.mlbg_balance, 0)::numeric,
    f.strike_default_pct
  from public.factory_locations f
  inner join public.factory_occupations fo on fo.factory_id = f.id
  left join public.profiles p on p.id = fo.user_id
  union all
  select
    'emart'::text,
    e.id, e.name,
    '이마트'::text,
    eo.user_id,
    p.display_name,
    coalesce(p.mlbg_balance, 0)::numeric,
    e.strike_default_pct
  from public.emart_locations e
  inner join public.emart_occupations eo on eo.emart_id = e.id
  left join public.profiles p on p.id = eo.user_id
  order by 4, 3;
$$;
grant execute on function public.list_struck_targets() to authenticated;

notify pgrst, 'reload schema';
