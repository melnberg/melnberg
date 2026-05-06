-- ──────────────────────────────────────────────
-- 132: 최근 통행료 결제 내역 (피드용)
-- ──────────────────────────────────────────────

create or replace function public.list_recent_bridge_tolls(p_limit int default 30)
returns table(
  id bigint,
  bridge_id bigint,
  bridge_name text,
  payer_id uuid,
  payer_name text,
  owner_id uuid,
  owner_name text,
  amount numeric,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    t.id, t.bridge_id, f.name,
    t.user_id, payer.display_name,
    t.bridge_owner_id, owner.display_name,
    t.amount, t.created_at
  from public.bridge_toll_log t
  left join public.factory_locations f on f.id = t.bridge_id
  left join public.profiles payer on payer.id = t.user_id
  left join public.profiles owner on owner.id = t.bridge_owner_id
  where t.created_at > now() - interval '24 hours'
  order by t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
grant execute on function public.list_recent_bridge_tolls(int) to anon, authenticated;

notify pgrst, 'reload schema';
