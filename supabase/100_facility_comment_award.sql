-- ──────────────────────────────────────────────
-- 100: 상업용 부동산 댓글 (factory_comment, emart_comment) 적립
-- - mlbg_award_log CHECK 제약 확장
-- - 기존 factory_comments / emart_comments 행을 0.5 mlbg 로 백필
-- - balance 도 +0.5 × 댓글수 만큼 더해줌
-- ──────────────────────────────────────────────

-- 1) CHECK 제약 동적 탐색·교체 (089과 동일 방식)
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'mlbg_award_log' and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%kind%check%';
  if v_conname is not null then
    execute format('alter table public.mlbg_award_log drop constraint %I', v_conname);
  end if;
end $$;

alter table public.mlbg_award_log
  add constraint mlbg_award_log_kind_check
  check (kind in (
    'apt_post', 'apt_comment',
    'community_post', 'community_comment',
    'hotdeal_post', 'hotdeal_comment',
    'factory_comment', 'emart_comment'
  ));

-- 2) BEFORE — 시설 댓글 적립 현황
select 'BEFORE' as phase, kind, count(*) as cnt
from public.mlbg_award_log
where kind in ('factory_comment', 'emart_comment')
group by kind;

-- 3) 백필 — emart_comments 모두 +0.5
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select author_id, 'emart_comment', id, 0.5, 1, 0.5, '백필-100'
from public.emart_comments
where deleted_at is null
on conflict (kind, ref_id) do nothing;

-- 4) 백필 — factory_comments 모두 +0.5
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select author_id, 'factory_comment', id, 0.5, 1, 0.5, '백필-100'
from public.factory_comments
where deleted_at is null
on conflict (kind, ref_id) do nothing;

-- 5) balance 보전 — award_total 기준 부족분만 채움
update public.profiles p
set mlbg_balance = a.award_total
from (
  select user_id, sum(earned) as award_total
  from public.mlbg_award_log
  group by user_id
) a
where p.id = a.user_id
  and coalesce(p.mlbg_balance, 0) < a.award_total;

-- 6) AFTER
select 'AFTER' as phase, kind, count(*) as cnt
from public.mlbg_award_log
where kind in ('factory_comment', 'emart_comment')
group by kind;

notify pgrst, 'reload schema';
