-- ──────────────────────────────────────────────
-- 171: 자산 급등 TOP — 어제 스냅샷(wealth_ranking_snapshots) 대비 오늘 자산 변화량 기준
-- /ranking 상단 전광판용. 어제 데이터 없는 신규 가입자는 yesterday_wealth=0 으로 처리되어
-- 오늘 자산이 곧 delta 가 됨 → 첫날 가입자가 1위 독점 막기 위해 어제 스냅샷에 있는 사용자만 포함.
-- ──────────────────────────────────────────────

drop function if exists public.get_wealth_surge_top(int);
create or replace function public.get_wealth_surge_top(p_limit int default 30)
returns table(
  rank int,
  user_id uuid,
  display_name text,
  today_wealth numeric,
  yesterday_wealth numeric,
  delta numeric,
  delta_pct numeric
)
language sql stable as $$
  with prev_date as (
    select max(snapshot_date) as d
    from public.wealth_ranking_snapshots
    where snapshot_date < current_date
  ),
  yesterday as (
    select s.user_id, s.total_wealth as yesterday_wealth
    from public.wealth_ranking_snapshots s, prev_date pd
    where s.snapshot_date = pd.d
  ),
  today as (
    select id as user_id, display_name, total_wealth as today_wealth
    from public.user_wealth_ranking
    where display_name is not null
  ),
  joined as (
    select
      t.user_id,
      t.display_name,
      t.today_wealth,
      y.yesterday_wealth,
      (t.today_wealth - y.yesterday_wealth) as delta,
      case when y.yesterday_wealth > 0
        then ((t.today_wealth - y.yesterday_wealth) / y.yesterday_wealth) * 100
        else null
      end as delta_pct
    from today t
    join yesterday y on y.user_id = t.user_id   -- 어제 있던 사람만
    where t.today_wealth - y.yesterday_wealth > 0
  )
  select
    (row_number() over (order by delta desc, user_id))::int as rank,
    user_id, display_name, today_wealth, yesterday_wealth, delta, delta_pct
  from joined
  order by delta desc, user_id
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
grant execute on function public.get_wealth_surge_top(int) to anon, authenticated;

notify pgrst, 'reload schema';
