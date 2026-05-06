-- ──────────────────────────────────────────────
-- 110: 정당 본부 7곳 분양 추가 (영등포구 여의도 / 당산)
-- 더불어민주당 / 국민의힘 / 조국혁신당 / 개혁신당 / 진보당 / 기본소득당 / 사회민주당
-- 분양가 20, 일 수익 1 (소형 시설급)
-- 좌표는 영등포구 국회대로 일대 추정 — 정확화는 어드민에서 수정 가능.
-- ──────────────────────────────────────────────

alter table public.factory_locations
  drop constraint if exists factory_locations_brand_check;
alter table public.factory_locations
  add constraint factory_locations_brand_check
  check (brand in (
    'hynix', 'samsung', 'costco', 'union', 'cargo', 'terminal', 'station',
    'party_dem', 'party_ppl', 'party_jhs', 'party_ref', 'party_jin', 'party_basic', 'party_sd'
  ));

insert into public.factory_locations (brand, name, address, lat, lng, occupy_price, daily_income) values
  ('party_dem',   '더불어민주당 본부', '서울 영등포구 국회대로68길 7',                 37.5340, 126.9170, 20, 1),
  ('party_ppl',   '국민의힘 본부',     '서울 영등포구 국회대로74길 12 (남중빌딩)',     37.5325, 126.9165, 20, 1),
  ('party_jhs',   '조국혁신당 본부',   '서울 영등포구 국회대로70길 15-1 (극동VIP빌딩)', 37.5335, 126.9175, 20, 1),
  ('party_ref',   '개혁신당 본부',     '서울 영등포구 당산로41길 11, 206-207호 (당산동)', 37.5347, 126.9020, 20, 1),
  ('party_jin',   '진보당 본부',       '서울 영등포구 국회대로 인근',                   37.5320, 126.9180, 20, 1),
  ('party_basic', '기본소득당 본부',   '서울 영등포구 국회대로70길 15-1, 302호',        37.5336, 126.9176, 20, 1),
  ('party_sd',    '사회민주당 본부',   '서울 영등포구 국회대로 인근',                   37.5328, 126.9172, 20, 1)
on conflict do nothing;

-- 이미 INSERT 된 row 가 있으면 (이전 SQL 실행 시 50/3 으로 들어갔을 수 있음) 가격/수익 갱신
update public.factory_locations set occupy_price = 20, daily_income = 1
  where brand in ('party_dem','party_ppl','party_jhs','party_ref','party_jin','party_basic','party_sd');

-- list_struck_targets 의 brand_label CASE 확장 — 정당 brand 도 한글 라벨로
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
