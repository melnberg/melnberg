-- ──────────────────────────────────────────────
-- 097: apt_post earned 재계산 + 실행 전후 진단
-- 정책: 20자=1줄. lines = max(\n줄수, 글자수/20)
-- 1줄=0, 2~4줄=2, 5~9줄=3, 10줄+=5
-- 096 이 안 돌아간 케이스 대비 — 더 단순화해서 재실행
-- ──────────────────────────────────────────────

-- 0) BEFORE — 현재 apt_post earned 분포
select 'BEFORE' as phase, earned, count(*) as cnt
from public.mlbg_award_log
where kind = 'apt_post'
group by earned
order by earned;

-- 1) 모든 apt_discussions 로 INSERT/UPDATE 강제
with apt_calc as (
  select d.id as ref_id, d.author_id,
    greatest(
      (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
       where length(trim(ln.t)) > 0)::int,
      (length(trim(coalesce(d.content,''))) / 20)::int
    ) as lines
  from public.apt_discussions d
  where d.deleted_at is null
)
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select author_id, 'apt_post', ref_id,
  case when lines >= 10 then 5 when lines >= 5 then 3 when lines >= 2 then 2 else 0 end,
  1,
  case when lines >= 10 then 5 when lines >= 5 then 3 when lines >= 2 then 2 else 0 end,
  '재계산-097 (' || lines || '줄)'
from apt_calc
on conflict (kind, ref_id) do update
  set earned = excluded.earned,
      base = excluded.base,
      ai_reason = excluded.ai_reason;

-- 2) balance 보전 (부족분만)
update public.profiles p
set mlbg_balance = a.award_total
from (
  select user_id, sum(earned) as award_total
  from public.mlbg_award_log
  group by user_id
) a
where p.id = a.user_id
  and coalesce(p.mlbg_balance, 0) < a.award_total;

-- 3) AFTER — 재계산 후 분포
select 'AFTER' as phase, earned, count(*) as cnt
from public.mlbg_award_log
where kind = 'apt_post'
group by earned
order by earned;

-- 4) 검증 — 최근 10개 글의 chars / lines / earned
select d.id, left(d.title, 25) as title,
       length(trim(coalesce(d.content,''))) as chars,
       greatest(
         (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
          where length(trim(ln.t)) > 0)::int,
         (length(trim(coalesce(d.content,''))) / 20)::int
       ) as policy_lines,
       m.earned
from public.apt_discussions d
left join public.mlbg_award_log m on m.kind='apt_post' and m.ref_id=d.id
where d.deleted_at is null
order by d.created_at desc
limit 10;

notify pgrst, 'reload schema';
