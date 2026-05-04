-- ──────────────────────────────────────────────
-- 046: 강제집행 당한 사용자에게 알림 (apt_evicted)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('community_comment','apt_comment','apt_evicted'));

-- 단지명 스냅샷 — 알림 표시할 때 join 안 하고 바로 보여주기
alter table public.notifications
  add column if not exists apt_name text;

-- apt_occupier_events 에 evict 가 들어오면 prev 점거인에게 알림 생성
create or replace function public.notify_apt_evicted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apt_name text;
begin
  if new.event <> 'evict' then return new; end if;
  if new.prev_occupier_id is null then return new; end if;
  if new.prev_occupier_id = new.actor_id then return new; end if;

  select apt_nm into v_apt_name from public.apt_master where id = new.apt_id;

  insert into public.notifications(
    recipient_id, type, apt_master_id, apt_name, actor_id, actor_name
  ) values (
    new.prev_occupier_id, 'apt_evicted', new.apt_id, v_apt_name, new.actor_id, new.actor_name
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_apt_evicted on public.apt_occupier_events;
create trigger trg_notify_apt_evicted
  after insert on public.apt_occupier_events
  for each row execute function public.notify_apt_evicted();

comment on column public.notifications.apt_name is '강제집행 알림용 단지명 스냅샷.';
