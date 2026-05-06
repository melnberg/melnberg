-- ──────────────────────────────────────────────
-- 150: 자산 순위 게시판 — 1등부터 끝까지 페이지네이션
-- 069 의 user_wealth_ranking view + get_wealth_ranking 위에 paged RPC 추가
-- ──────────────────────────────────────────────

-- 페이지네이션 RPC — 전체 순위 중 일부 슬라이스 + total count 한 번에
create or replace function public.get_wealth_ranking_paged(
  p_offset int default 0,
  p_limit int default 50
)
returns table(
  rank bigint,
  user_id uuid,
  display_name text,
  total_wealth numeric,
  mlbg_balance numeric,
  apt_value numeric,
  apt_count int,
  total_count bigint
)
language sql stable as $$
  with ranked as (
    select
      row_number() over (order by total_wealth desc, id) as rank,
      id, display_name, total_wealth, mlbg_balance, apt_value, apt_count::int as apt_count
    from public.user_wealth_ranking
    where display_name is not null
  ),
  total as (select count(*)::bigint as c from ranked)
  select r.rank, r.id, r.display_name, r.total_wealth, r.mlbg_balance, r.apt_value, r.apt_count, t.c
  from ranked r cross join total t
  order by r.rank
  offset greatest(0, coalesce(p_offset, 0))
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
grant execute on function public.get_wealth_ranking_paged(int, int) to anon, authenticated;

notify pgrst, 'reload schema';
