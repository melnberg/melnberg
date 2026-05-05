-- ──────────────────────────────────────────────
-- 091: 단지 토론 글 적립 재계산 — 줄 수 + 글자 수 max 채택
-- 정책 변경: 1줄이어도 30자 이상이면 +2 시작. 150자+ → +3, 400자+ → +5
-- ──────────────────────────────────────────────

-- 1) 기존 apt_post award 행을 새 정책으로 갱신
update public.mlbg_award_log m
set earned = sub.new_earned,
    base = sub.new_earned,
    ai_reason = '재계산 — 091'
from (
  select
    d.id as ref_id,
    greatest(
      case
        when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
              where length(trim(ln.t)) > 0) >= 10 then 5
        when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
              where length(trim(ln.t)) > 0) >= 5 then 3
        when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
              where length(trim(ln.t)) > 0) >= 2 then 2
        else 0
      end,
      case
        when length(trim(coalesce(d.content,''))) >= 400 then 5
        when length(trim(coalesce(d.content,''))) >= 150 then 3
        when length(trim(coalesce(d.content,''))) >= 30 then 2
        else 0
      end
    ) as new_earned
  from public.apt_discussions d
  where d.deleted_at is null
) sub
where m.kind = 'apt_post' and m.ref_id = sub.ref_id
  and m.earned <> sub.new_earned;

-- 2) profiles.mlbg_balance 도 차이만큼 보정
-- 단순화 — 차이를 합산해서 add (음수 가능)
update public.profiles p
set mlbg_balance = coalesce(p.mlbg_balance, 0) + delta.diff
from (
  select d.author_id as user_id,
         sum(
           greatest(
             case
               when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
                     where length(trim(ln.t)) > 0) >= 10 then 5
               when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
                     where length(trim(ln.t)) > 0) >= 5 then 3
               when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
                     where length(trim(ln.t)) > 0) >= 2 then 2
               else 0
             end,
             case
               when length(trim(coalesce(d.content,''))) >= 400 then 5
               when length(trim(coalesce(d.content,''))) >= 150 then 3
               when length(trim(coalesce(d.content,''))) >= 30 then 2
               else 0
             end
           ) - coalesce(m.earned, 0)
         ) as diff
  from public.apt_discussions d
  left join public.mlbg_award_log m on m.kind='apt_post' and m.ref_id=d.id
  where d.deleted_at is null
  group by d.author_id
) delta
where p.id = delta.user_id and delta.diff <> 0;
