-- ──────────────────────────────────────────────
-- 096: apt_post earned 강제 재계산 (092/093 누락 보강)
-- 정책: 20자=1줄. max(\n줄수, 글자/20). 1줄=0, 2~4줄=2, 5~9줄=3, 10줄+=5
-- ──────────────────────────────────────────────

-- 1) 모든 apt_discussions 에 대해 award row 강제 INSERT/UPDATE
with apt_calc as (
  select d.id as ref_id, d.author_id,
    greatest(
      (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
       where length(trim(ln.t)) > 0),
      length(trim(coalesce(d.content,''))) / 20
    ) as lines
  from public.apt_discussions d
  where d.deleted_at is null
),
target as (
  select ref_id, author_id,
    case when lines >= 10 then 5
         when lines >= 5 then 3
         when lines >= 2 then 2
         else 0 end as new_earned
  from apt_calc
)
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select author_id, 'apt_post', ref_id, new_earned, 1, new_earned, '강제재계산-096'
from target
on conflict (kind, ref_id) do update
  set earned = excluded.earned,
      base = excluded.base,
      ai_reason = '강제재계산-096';

-- 2) balance 보전 — award_total 기준으로 부족분 채움
update public.profiles p
set mlbg_balance = a.award_total
from (
  select user_id, sum(earned) as award_total
  from public.mlbg_award_log
  group by user_id
) a
where p.id = a.user_id
  and coalesce(p.mlbg_balance, 0) < a.award_total;

notify pgrst, 'reload schema';

-- 검증
select d.id, left(d.title, 25) as title,
       length(trim(coalesce(d.content,''))) as chars,
       greatest(
         (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
          where length(trim(ln.t)) > 0),
         length(trim(coalesce(d.content,''))) / 20
       ) as policy_lines,
       m.earned
from public.apt_discussions d
left join public.mlbg_award_log m on m.kind='apt_post' and m.ref_id=d.id
where d.deleted_at is null
order by d.created_at desc
limit 10;
