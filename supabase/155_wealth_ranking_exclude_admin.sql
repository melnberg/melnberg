-- ──────────────────────────────────────────────
-- 155: 자산 랭킹에서 admin 계정 제외
-- user_wealth_ranking view 의 SELECT 만 변경 (CREATE OR REPLACE)
--   → 의존하는 RPC (get_wealth_ranking, get_wealth_ranking_paged 등) 살아있음
--   → security_invoker = true 도 유지
-- ──────────────────────────────────────────────

create or replace view public.user_wealth_ranking
with (security_invoker = true)
as
  select
    p.id,
    p.display_name,
    p.tier,
    p.tier_expires_at,
    p.mlbg_balance,
    coalesce(asset.value, 0) as apt_value,
    coalesce(p.mlbg_balance, 0) + coalesce(asset.value, 0) as total_wealth,
    coalesce(asset.cnt, 0) as apt_count
  from public.profiles p
  left join lateral (
    select sum(public.get_apt_listing_price(am.lawd_cd))::numeric as value,
           count(*) as cnt
    from public.apt_master am
    where am.occupier_id = p.id
  ) asset on true
  where p.tier in ('paid', 'free')
    and coalesce(p.is_admin, false) = false  -- admin 제외 (랭킹·스냅샷·페이지 모두)
  order by total_wealth desc;

grant select on public.user_wealth_ranking to anon, authenticated;
comment on view public.user_wealth_ranking is '자산 랭킹 — mlbg 잔액 + 보유 단지 분양가 합. admin 제외.';

notify pgrst, 'reload schema';
