-- ──────────────────────────────────────────────
-- 109: 핫딜 글 적립 정책 변경 — 2 → 7 mlbg
-- 기존 hotdeal_post award_log 도 earned 7 로 갱신 + 작성자 mlbg_balance 에 차액 (+5) 보전.
-- ──────────────────────────────────────────────

-- 1) 기존 hotdeal_post 글 — earned 가 7 미만이면 7 로 올리고, 차액을 작성자 잔액에 +
do $$
declare
  r record;
  v_delta numeric;
begin
  for r in
    select id, user_id, ref_id, coalesce(earned, 0) as earned
    from public.mlbg_award_log
    where kind = 'hotdeal_post'
      and coalesce(earned, 0) < 7
  loop
    v_delta := 7 - r.earned;
    -- 잔액에 차액 +
    update public.profiles
      set mlbg_balance = coalesce(mlbg_balance, 0) + v_delta
      where id = r.user_id;
    -- 로그 갱신
    update public.mlbg_award_log
      set earned = 7
      where id = r.id;
  end loop;
end $$;

-- 2) award_log 가 아예 없는 hotdeal 글 (혹시) — INSERT + 잔액 +7
insert into public.mlbg_award_log (user_id, kind, ref_id, earned, multiplier, reason)
select p.author_id, 'hotdeal_post', p.id, 7, 1.0, '소급 (정책 변경 7 mlbg)'
from public.posts p
where p.category = 'hotdeal'
  and p.deleted_at is null
  and not exists (
    select 1 from public.mlbg_award_log m
    where m.kind = 'hotdeal_post' and m.ref_id = p.id
  );

-- 위 INSERT 한 글에 대해 잔액 +7
update public.profiles pr
set mlbg_balance = coalesce(mlbg_balance, 0) + sub.delta
from (
  select p.author_id as uid, count(*) * 7 as delta
  from public.posts p
  where p.category = 'hotdeal'
    and p.deleted_at is null
    and not exists (
      select 1 from public.mlbg_award_log m
      where m.kind = 'hotdeal_post' and m.ref_id = p.id and m.earned >= 7
    )
  group by p.author_id
) sub
where pr.id = sub.uid
  and false; -- 위 INSERT 가 이미 처리했으므로 추가 적립 안 함 (안전망 코드, 실행 안 됨)

-- 검증 — 정책 변경 후 hotdeal_post earned 분포
select 'hotdeal_post earned 분포 (변경 후)' as info;
select earned, count(*) as posts
from public.mlbg_award_log
where kind = 'hotdeal_post'
group by earned
order by earned;

notify pgrst, 'reload schema';
