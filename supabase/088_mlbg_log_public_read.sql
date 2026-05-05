-- ──────────────────────────────────────────────
-- 088: mlbg_award_log 누구나 읽기 (피드/글 페이지에서 +N 노출 위해)
-- 기존 'mlbg award readable by owner' 정책 → 'readable by all' 로 완화.
-- 작성·수정·삭제는 admin 또는 RPC 만 가능 (기존 정책 유지).
-- ──────────────────────────────────────────────

drop policy if exists "mlbg award readable by owner" on public.mlbg_award_log;
drop policy if exists "mlbg award readable by all" on public.mlbg_award_log;
create policy "mlbg award readable by all"
  on public.mlbg_award_log for select using (true);

-- 인천지부 점거자 — 후상 양도 (기존 점거 row 가 없으면 INSERT, 있으면 UPDATE)
insert into public.factory_occupations (factory_id, user_id, last_claimed_at)
select fl.id, p.id, now()
from public.factory_locations fl
cross join public.profiles p
where fl.brand = 'union' and fl.name like '%인천지부%'
  and p.display_name = '후상'
on conflict (factory_id) do update set
  user_id = excluded.user_id,
  occupied_at = now(),
  last_claimed_at = now();
