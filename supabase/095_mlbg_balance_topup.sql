-- ──────────────────────────────────────────────
-- 095: mlbg_balance 부족분 보전
-- 사용자의 balance < award_total 이면 award_total 만큼 set.
-- balance >= award_total 인 사용자(출석·룰렛·기존 적립)는 그대로 둠.
-- ──────────────────────────────────────────────

update public.profiles p
set mlbg_balance = a.award_total
from (
  select user_id, sum(earned) as award_total
  from public.mlbg_award_log
  group by user_id
) a
where p.id = a.user_id
  and coalesce(p.mlbg_balance, 0) < a.award_total;

-- 검증용
select p.display_name, p.mlbg_balance,
       coalesce((select sum(earned) from public.mlbg_award_log where user_id=p.id), 0) as award_total
from public.profiles p
where p.display_name is not null
order by award_total desc nulls last
limit 30;
