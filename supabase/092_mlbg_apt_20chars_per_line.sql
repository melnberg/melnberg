-- ──────────────────────────────────────────────
-- 092: 단지 토론 적립 — 20자 = 1줄 환산. \n 줄 수와 글자환산 줄 중 큰 값.
--   1줄(20자+): 0 (미지급)
--   2~4줄(40자+): 2
--   5~9줄(100자+): 3
--   10줄+(200자+): 5
-- ──────────────────────────────────────────────

with apt_calc as (
  select
    d.id as ref_id,
    d.author_id,
    greatest(
      (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
       where length(trim(ln.t)) > 0),
      length(trim(coalesce(d.content,''))) / 20
    ) as lines
  from public.apt_discussions d
  where d.deleted_at is null
),
apt_target as (
  select ref_id, author_id,
    case
      when lines >= 10 then 5
      when lines >= 5 then 3
      when lines >= 2 then 2
      else 0
    end as new_earned
  from apt_calc
)
update public.mlbg_award_log m
set earned = t.new_earned, base = t.new_earned, ai_reason = '재계산 — 092'
from apt_target t
where m.kind = 'apt_post' and m.ref_id = t.ref_id and m.earned <> t.new_earned;

-- balance 보정 — 변경된 차이만큼 갱신 (간단 버전)
-- (이전 091/090 백필분과 누적이라 약간의 오차 가능. 0 인 글이 +N 되거나 +N 이 0 되는 차이만 반영.)
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
apt_target as (
  select ref_id, author_id,
    case
      when lines >= 10 then 5
      when lines >= 5 then 3
      when lines >= 2 then 2
      else 0
    end as new_earned
  from apt_calc
),
diffs as (
  select t.author_id as user_id,
         sum(t.new_earned - coalesce(m.earned, 0)) as diff
  from apt_target t
  left join public.mlbg_award_log m on m.kind='apt_post' and m.ref_id=t.ref_id
  group by t.author_id
)
update public.profiles p
set mlbg_balance = coalesce(p.mlbg_balance, 0) + d.diff
from diffs d
where p.id = d.user_id and d.diff <> 0;
