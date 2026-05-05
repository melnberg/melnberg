-- ──────────────────────────────────────────────
-- 089: mlbg_award_log CHECK 제약 완화 + RLS 재적용 + 누락분 백필
-- 원인:
--   - 059 의 CHECK (kind in 4개) 가 hotdeal_* 차단 → 핫딜 글 award 실패
--   - 088 적용 안 됐거나 PostgREST 스키마 캐시 stale 시 anon 읽기 차단
-- ──────────────────────────────────────────────

-- 1) CHECK 제약 제거 (kind 자유롭게 허용)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'mlbg_award_log' and constraint_type = 'CHECK'
  ) then
    execute (
      select 'alter table public.mlbg_award_log drop constraint ' || quote_ident(constraint_name)
      from information_schema.table_constraints
      where table_name = 'mlbg_award_log' and constraint_type = 'CHECK'
      limit 1
    );
  end if;
end $$;

-- 2) RLS — 누구나 읽기 (피드 anon)
drop policy if exists "mlbg award readable by owner" on public.mlbg_award_log;
drop policy if exists "mlbg award readable by all"   on public.mlbg_award_log;
create policy "mlbg award readable by all"
  on public.mlbg_award_log for select using (true);

-- 3) PostgREST 스키마 reload (RLS 변경 즉시 반영)
notify pgrst, 'reload schema';

-- 4) 누락분 백필 — 최근 24시간 동안 작성됐는데 award 없는 커뮤글/핫딜글
--    (community/hotdeal post 의 새 정책: 무조건 2)
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select p.author_id, (case when p.category = 'hotdeal' then 'hotdeal_post' else 'community_post' end),
       p.id, 2, 1, 2, '백필 — 089'
from public.posts p
where p.created_at > now() - interval '24 hours'
  and p.deleted_at is null
  and p.category in ('community', 'hotdeal')
  and not exists (
    select 1 from public.mlbg_award_log m
    where m.kind in ('community_post', 'hotdeal_post') and m.ref_id = p.id
  )
on conflict (kind, ref_id) do nothing;

-- 5) 누락분 백필 — 최근 24시간 댓글 (community_comment / hotdeal_comment), 모두 1
insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
select c.author_id,
       (case when (select category from public.posts where id = c.post_id) = 'hotdeal'
             then 'hotdeal_comment' else 'community_comment' end),
       c.id, 1, 1, 1, '백필 — 089'
from public.comments c
where c.created_at > now() - interval '24 hours'
  and c.deleted_at is null
  and not exists (
    select 1 from public.mlbg_award_log m
    where m.kind in ('community_comment', 'hotdeal_comment') and m.ref_id = c.id
  )
on conflict (kind, ref_id) do nothing;

-- 6) 백필된 만큼 mlbg_balance 도 정확히 업데이트
update public.profiles p set mlbg_balance = coalesce(p.mlbg_balance, 0) + delta.add_amt
from (
  select user_id, sum(earned) as add_amt
  from public.mlbg_award_log
  where ai_reason = '백필 — 089'
  group by user_id
) delta
where p.id = delta.user_id;
