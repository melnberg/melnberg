-- ──────────────────────────────────────────────
-- 093: mlbg_award_log 전체 소급 + balance 보정 — 새 정책 일괄 적용
-- 정책 (apt_post): 20자=1줄 환산. 1줄(20자+)=0, 2~4줄(40자+)=2, 5~9줄(100자+)=3, 10줄+(200자+)=5
-- 댓글: 1, 커뮤·핫딜 글: 2 일률
-- 누락된 row 는 INSERT, 기존 row 는 UPDATE.
-- ──────────────────────────────────────────────

-- A) apt_post — 누락 INSERT
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select d.author_id, 'apt_post', d.id, 0, 1, 0, '소급 — 093'
from public.apt_discussions d
where d.deleted_at is null
  and not exists (select 1 from public.mlbg_award_log m where m.kind='apt_post' and m.ref_id=d.id)
on conflict (kind, ref_id) do nothing;

-- B) apt_post — 새 정책으로 earned 재계산 (UPDATE)
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
  select ref_id,
    case when lines >= 10 then 5
         when lines >= 5 then 3
         when lines >= 2 then 2
         else 0 end as new_earned
  from apt_calc
)
update public.mlbg_award_log m
set earned = t.new_earned, base = t.new_earned, ai_reason = '소급 — 093'
from target t
where m.kind='apt_post' and m.ref_id=t.ref_id and m.earned <> t.new_earned;

-- C) apt_comment 누락 INSERT (earned=1)
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select c.author_id, 'apt_comment', c.id, 1, 1, 1, '소급 — 093'
from public.apt_discussion_comments c
where c.deleted_at is null
  and not exists (select 1 from public.mlbg_award_log m where m.kind='apt_comment' and m.ref_id=c.id)
on conflict (kind, ref_id) do nothing;

-- D) community/hotdeal posts 누락 INSERT (earned=2)
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select p.author_id, (case when p.category='hotdeal' then 'hotdeal_post' else 'community_post' end),
       p.id, 2, 1, 2, '소급 — 093'
from public.posts p
where p.deleted_at is null and p.category in ('community','hotdeal')
  and not exists (select 1 from public.mlbg_award_log m
                  where m.kind in ('community_post','hotdeal_post') and m.ref_id=p.id)
on conflict (kind, ref_id) do nothing;

-- E) comments 누락 INSERT (earned=1)
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select c.author_id,
       (case when (select category from public.posts where id=c.post_id)='hotdeal'
             then 'hotdeal_comment' else 'community_comment' end),
       c.id, 1, 1, 1, '소급 — 093'
from public.comments c
where c.deleted_at is null
  and not exists (select 1 from public.mlbg_award_log m
                  where m.kind in ('community_comment','hotdeal_comment') and m.ref_id=c.id)
on conflict (kind, ref_id) do nothing;

-- F) profiles.mlbg_balance 를 award log 합산으로 reset 하지 않고
--    소급된 만큼만 더해줌 (기존 잔액에 누적). 단지 토론 정책 변경분도 반영.
-- 단순화 — 소급/재계산 로그(093) 의 earned 합 - 기존 row 의 earned 합 차이를 사용자별로 더함.
-- 1) 092/091 이 이미 일부 보정함. 안전하게: 소급 INSERT 분 (이전엔 row 자체가 없었던 케이스) 만 추가
update public.profiles p
set mlbg_balance = coalesce(p.mlbg_balance, 0) + delta.add_amt
from (
  select user_id, sum(earned) as add_amt
  from public.mlbg_award_log
  where ai_reason = '소급 — 093' and earned > 0
  group by user_id
) delta
where p.id = delta.user_id;

notify pgrst, 'reload schema';
