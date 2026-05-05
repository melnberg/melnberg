-- ──────────────────────────────────────────────
-- 102: 사용자 보유 아파트 평가액 RPC
-- 정책:
--   1) 기본: 구(lawd_cd) 기준 분양가 (get_apt_listing_price)
--   2) 실거래 (apt_occupier_events.event='sell') 있으면 최근 거래가로 대체
-- ──────────────────────────────────────────────

create or replace function public.get_user_apt_assets(p_uid uuid)
returns table(
  id bigint,
  apt_nm text,
  dong text,
  base_price int,
  last_trade_price numeric,
  value numeric,
  source text
)
language sql stable security definer set search_path = public as $$
  with owned as (
    select m.id, m.apt_nm, m.dong, m.lawd_cd
    from public.apt_master m
    where m.occupier_id = p_uid
  ),
  trades as (
    select e.apt_id, e.actor_score as price, e.occurred_at,
           row_number() over (partition by e.apt_id order by e.occurred_at desc) as rn
    from public.apt_occupier_events e
    where e.event = 'sell'
      and e.apt_id in (select id from owned)
  ),
  latest as (
    select apt_id, price from trades where rn = 1
  )
  select o.id, o.apt_nm, o.dong,
    public.get_apt_listing_price(o.lawd_cd) as base_price,
    l.price as last_trade_price,
    coalesce(l.price, public.get_apt_listing_price(o.lawd_cd)::numeric) as value,
    case when l.price is not null then '실거래' else '분양가' end as source
  from owned o
  left join latest l on l.apt_id = o.id;
$$;

grant execute on function public.get_user_apt_assets(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
