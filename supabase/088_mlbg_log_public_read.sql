-- ──────────────────────────────────────────────
-- 088: mlbg_award_log 누구나 읽기 + 인천지부 후상 양도
-- ──────────────────────────────────────────────

drop policy if exists "mlbg award readable by owner" on public.mlbg_award_log;
drop policy if exists "mlbg award readable by all"   on public.mlbg_award_log;
create policy "mlbg award readable by all"
  on public.mlbg_award_log for select using (true);

notify pgrst, 'reload schema';

insert into public.factory_occupations (factory_id, user_id, last_claimed_at)
select fl.id, p.id, now()
from public.factory_locations fl
cross join public.profiles p
where fl.brand = 'union'
  and fl.name like '%인천지부%'
  and p.display_name = '후상'
on conflict (factory_id) do update
  set user_id = excluded.user_id,
      occupied_at = now(),
      last_claimed_at = now();
