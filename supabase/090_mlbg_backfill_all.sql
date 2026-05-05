-- ──────────────────────────────────────────────
-- 090: mlbg_award_log 누락분 일괄 백필 (apt + 커뮤 + 핫딜 글/댓글)
-- 089 는 community/hotdeal 만 백필. 단지 토론 글·댓글까지 포함.
-- 정책 (결정론):
--   apt_post: 1줄 0 / 2~4줄 2 / 5~9줄 3 / 10줄+ 5
--   community/hotdeal post: 2 (일률)
--   *_comment: 1
-- ──────────────────────────────────────────────

-- 줄 수 카운트 헬퍼 (인라인)
-- regexp_split_to_array(content, E'\n') 후 trim 비어있는 행 제외 카운트.

-- 1) apt_discussions (단지 토론 글)
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select d.author_id, 'apt_post', d.id,
  case
    when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
          where length(trim(ln.t)) > 0) >= 10 then 5
    when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
          where length(trim(ln.t)) > 0) >= 5 then 3
    when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
          where length(trim(ln.t)) > 0) >= 2 then 2
    else 0
  end,
  1,
  case
    when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
          where length(trim(ln.t)) > 0) >= 10 then 5
    when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
          where length(trim(ln.t)) > 0) >= 5 then 3
    when (select count(*) from regexp_split_to_table(coalesce(d.content,''), E'\n') as ln(t)
          where length(trim(ln.t)) > 0) >= 2 then 2
    else 0
  end,
  '백필 — 090'
from public.apt_discussions d
where d.deleted_at is null
  and not exists (select 1 from public.mlbg_award_log m where m.kind='apt_post' and m.ref_id=d.id)
on conflict (kind, ref_id) do nothing;

-- 2) apt_discussion_comments (단지 토론 댓글) — 1
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select c.author_id, 'apt_comment', c.id, 1, 1, 1, '백필 — 090'
from public.apt_discussion_comments c
where c.deleted_at is null
  and not exists (select 1 from public.mlbg_award_log m where m.kind='apt_comment' and m.ref_id=c.id)
on conflict (kind, ref_id) do nothing;

-- 3) posts (커뮤·핫딜) — 2 일률
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select p.author_id, (case when p.category='hotdeal' then 'hotdeal_post' else 'community_post' end),
       p.id, 2, 1, 2, '백필 — 090'
from public.posts p
where p.deleted_at is null and p.category in ('community','hotdeal')
  and not exists (select 1 from public.mlbg_award_log m
                  where m.kind in ('community_post','hotdeal_post') and m.ref_id=p.id)
on conflict (kind, ref_id) do nothing;

-- 4) comments — 1
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select c.author_id,
       (case when (select category from public.posts where id=c.post_id)='hotdeal'
             then 'hotdeal_comment' else 'community_comment' end),
       c.id, 1, 1, 1, '백필 — 090'
from public.comments c
where c.deleted_at is null
  and not exists (select 1 from public.mlbg_award_log m
                  where m.kind in ('community_comment','hotdeal_comment') and m.ref_id=c.id)
on conflict (kind, ref_id) do nothing;

-- 5) 백필된 만큼 mlbg_balance 정확히 갱신 (089 백필분 제외 — 이번에만 add)
update public.profiles p set mlbg_balance = coalesce(p.mlbg_balance, 0) + delta.add_amt
from (
  select user_id, sum(earned) as add_amt
  from public.mlbg_award_log
  where ai_reason = '백필 — 090'
  group by user_id
) delta
where p.id = delta.user_id;

-- 6) PostgREST schema reload
notify pgrst, 'reload schema';
