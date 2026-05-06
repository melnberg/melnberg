-- ──────────────────────────────────────────────
-- 152: 자산 순위 일일 스냅샷 + 변동(rank delta) 표시
-- 매일 아침 (Vercel cron) 가 snapshot_wealth_ranking() 호출 → 그 날의 1등~끝까지 저장
-- get_wealth_ranking_paged 가 어제 스냅샷과 비교해서 prev_rank, rank_delta 까지 반환
-- ──────────────────────────────────────────────

create table if not exists public.wealth_ranking_snapshots (
  snapshot_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank int not null,
  total_wealth numeric not null,
  display_name text,
  primary key (snapshot_date, user_id)
);
create index if not exists wealth_ranking_snapshots_date_idx
  on public.wealth_ranking_snapshots(snapshot_date desc);

alter table public.wealth_ranking_snapshots enable row level security;
drop policy if exists "wealth_ranking_snapshots readable by all" on public.wealth_ranking_snapshots;
create policy "wealth_ranking_snapshots readable by all"
  on public.wealth_ranking_snapshots for select using (true);
-- INSERT 는 service_role 만 (cron 에서 호출). 일반 유저는 안 됨.

-- 오늘 날짜로 스냅샷 1회 저장. 이미 있으면 skip.
create or replace function public.snapshot_wealth_ranking()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if exists (select 1 from public.wealth_ranking_snapshots where snapshot_date = current_date) then
    return 0;
  end if;
  insert into public.wealth_ranking_snapshots (snapshot_date, user_id, rank, total_wealth, display_name)
  select
    current_date,
    id,
    (row_number() over (order by total_wealth desc, id))::int,
    total_wealth,
    display_name
  from public.user_wealth_ranking
  where display_name is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.snapshot_wealth_ranking() to service_role;

-- 페이지네이션 RPC 갱신 — prev_rank, rank_delta 추가
-- rank_delta > 0  : 어제보다 순위 상승 (빨간 ↑)
-- rank_delta < 0  : 어제보다 순위 하락 (파란 ↓)
-- rank_delta = 0  : 변동 없음 (−)
-- rank_delta = null: 어제 스냅샷에 없던 신규 (NEW)
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
  total_count bigint,
  prev_rank int,
  rank_delta int
)
language sql stable as $$
  with ranked as (
    select
      row_number() over (order by total_wealth desc, id) as rank,
      id, display_name, total_wealth, mlbg_balance, apt_value, apt_count::int as apt_count
    from public.user_wealth_ranking
    where display_name is not null
  ),
  prev_date as (
    select max(snapshot_date) as d
    from public.wealth_ranking_snapshots
    where snapshot_date < current_date
  ),
  prev as (
    select s.user_id, s.rank as prev_rank
    from public.wealth_ranking_snapshots s, prev_date pd
    where s.snapshot_date = pd.d
  ),
  total as (select count(*)::bigint as c from ranked)
  select
    r.rank,
    r.id,
    r.display_name,
    r.total_wealth,
    r.mlbg_balance,
    r.apt_value,
    r.apt_count,
    t.c,
    p.prev_rank,
    case when p.prev_rank is null then null
         else p.prev_rank - r.rank::int  -- + 면 상승 (rank 숫자가 작아짐)
    end as rank_delta
  from ranked r
  cross join total t
  left join prev p on p.user_id = r.id
  order by r.rank
  offset greatest(0, coalesce(p_offset, 0))
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
grant execute on function public.get_wealth_ranking_paged(int, int) to anon, authenticated;

notify pgrst, 'reload schema';
