-- ──────────────────────────────────────────────
-- 098: apt_post earned 재계산 — title + content 합쳐서
-- 097이 content 만 읽어서 단일라인 글 (title 만 있고 content 가 null)
-- 들을 모두 0으로 덮어쓴 버그 수정.
-- 정책: 20자=1줄. lines = max(\n줄수, 글자수/20)
-- ──────────────────────────────────────────────

with apt_calc as (
  select d.id as ref_id, d.author_id,
    -- title + content 합친 텍스트로 계산
    (coalesce(d.title,'') || E'\n' || coalesce(d.content,'')) as full_text
  from public.apt_discussions d
  where d.deleted_at is null
),
apt_lines as (
  select ref_id, author_id,
    greatest(
      (select count(*) from regexp_split_to_table(full_text, E'\n') as ln(t)
       where length(trim(ln.t)) > 0)::int,
      (length(trim(replace(full_text, E'\n', ''))) / 20)::int
    ) as lines
  from apt_calc
)
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select author_id, 'apt_post', ref_id,
  case when lines >= 10 then 5 when lines >= 5 then 3 when lines >= 2 then 2 else 0 end,
  1,
  case when lines >= 10 then 5 when lines >= 5 then 3 when lines >= 2 then 2 else 0 end,
  '재계산-098 (' || lines || '줄/title+content)'
from apt_lines
on conflict (kind, ref_id) do update
  set earned = excluded.earned,
      base = excluded.base,
      ai_reason = excluded.ai_reason;

-- balance 보전
update public.profiles p
set mlbg_balance = a.award_total
from (
  select user_id, sum(earned) as award_total
  from public.mlbg_award_log
  group by user_id
) a
where p.id = a.user_id
  and coalesce(p.mlbg_balance, 0) < a.award_total;

-- 검증 — 최근 10개 글
select d.id,
       left(coalesce(d.title,''), 25) as title,
       length(trim(coalesce(d.title,''))) as title_chars,
       length(trim(coalesce(d.content,''))) as content_chars,
       greatest(
         (select count(*) from regexp_split_to_table(
           coalesce(d.title,'') || E'\n' || coalesce(d.content,''), E'\n'
         ) as ln(t) where length(trim(ln.t)) > 0)::int,
         (length(trim(replace(
           coalesce(d.title,'') || E'\n' || coalesce(d.content,''), E'\n', ''
         ))) / 20)::int
       ) as policy_lines,
       m.earned
from public.apt_discussions d
left join public.mlbg_award_log m on m.kind='apt_post' and m.ref_id=d.id
where d.deleted_at is null
order by d.created_at desc
limit 10;

notify pgrst, 'reload schema';
