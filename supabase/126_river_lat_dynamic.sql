-- ──────────────────────────────────────────────
-- 126: han_river_lat 함수 정밀화 — 가장 가까운 다리의 lat 사용
-- 121 의 hard-coded 3구간 (37.560/37.520/37.535) 가 광진교/잠실 부근에서 부정확.
-- 광진교 실제 lat 37.5448, 광장동 단지 lat 37.547, 풍납동 단지 lat 37.535 → 둘 다
-- 임계값 37.535 ± 0.005 buffer 안에 들어가 횡단 미감지.
-- 변경: bridge brand 핀 중 가장 가까운 lng 의 다리 lat 을 한강 중심으로 사용.
-- ──────────────────────────────────────────────

create or replace function public.han_river_lat(p_lng double precision)
returns double precision
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (
      select lat from public.factory_locations
      where brand = 'bridge'
      order by abs(lng - p_lng) asc
      limit 1
    ),
    37.520  -- 다리 데이터 없으면 fallback
  );
$$;
grant execute on function public.han_river_lat(double precision) to authenticated, anon;

notify pgrst, 'reload schema';
