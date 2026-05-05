-- ──────────────────────────────────────────────
-- 099: 댓글 적립 정책 1 → 0.5 mlbg 로 변경 + 소급
-- 모든 *_comment 종류 (apt_comment, community_comment, hotdeal_comment) 적용.
-- balance 도 차액만큼 깎음.
-- ──────────────────────────────────────────────

-- 0) BEFORE — 댓글 earned 분포
select 'BEFORE' as phase, kind, earned, count(*) as cnt
from public.mlbg_award_log
where kind like '%_comment'
group by kind, earned
order by kind, earned;

-- 1) 차액 = 기존 earned - 0.5. 양수만 (이미 0.5 미만은 그대로).
with delta as (
  select user_id, sum(earned - 0.5) as drop_amount
  from public.mlbg_award_log
  where kind like '%_comment' and earned > 0.5
  group by user_id
)
update public.profiles p
set mlbg_balance = greatest(0, coalesce(p.mlbg_balance, 0) - d.drop_amount)
from delta d
where p.id = d.user_id;

-- 2) award log 도 0.5 로 내림
update public.mlbg_award_log
set earned = 0.5, base = 0.5, ai_reason = '정책변경-099 (댓글 +0.5)'
where kind like '%_comment' and earned > 0.5;

-- 3) AFTER
select 'AFTER' as phase, kind, earned, count(*) as cnt
from public.mlbg_award_log
where kind like '%_comment'
group by kind, earned
order by kind, earned;

notify pgrst, 'reload schema';
