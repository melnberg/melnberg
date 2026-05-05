-- ──────────────────────────────────────────────
-- 062: profiles.apt_count — 보유 단지 수 자동 유지
-- 모든 닉네임 표기에 "무주택 / 1주택 / 2주택+" 표시용.
-- apt_master.occupier_id 변동 시 trigger 가 source 카운트 갱신.
-- ──────────────────────────────────────────────

alter table public.profiles
  add column if not exists apt_count int not null default 0;

-- 초기 동기화 — 현재 점거 상태 기준
update public.profiles p
   set apt_count = coalesce(
     (select count(*) from public.apt_master where occupier_id = p.id), 0
   );

-- occupier_id 변동 시 양쪽 갱신 (떠나는 사람·새 점거인 모두)
create or replace function public.sync_profile_apt_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if (tg_op = 'INSERT') then
    v_new := new.occupier_id;
  elsif (tg_op = 'UPDATE') then
    v_old := old.occupier_id;
    v_new := new.occupier_id;
  elsif (tg_op = 'DELETE') then
    v_old := old.occupier_id;
  end if;

  if v_old is not null and v_old is distinct from v_new then
    update public.profiles
       set apt_count = coalesce((select count(*) from public.apt_master where occupier_id = v_old), 0)
     where id = v_old;
  end if;
  if v_new is not null and v_new is distinct from v_old then
    update public.profiles
       set apt_count = coalesce((select count(*) from public.apt_master where occupier_id = v_new), 0)
     where id = v_new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_apt_count_ins on public.apt_master;
create trigger trg_sync_apt_count_ins
  after insert on public.apt_master
  for each row execute function public.sync_profile_apt_count();

drop trigger if exists trg_sync_apt_count_upd on public.apt_master;
create trigger trg_sync_apt_count_upd
  after update of occupier_id on public.apt_master
  for each row execute function public.sync_profile_apt_count();

drop trigger if exists trg_sync_apt_count_del on public.apt_master;
create trigger trg_sync_apt_count_del
  after delete on public.apt_master
  for each row execute function public.sync_profile_apt_count();

comment on column public.profiles.apt_count is '현재 보유 단지 수 — 닉네임 옆 "N주택" 라벨용. trigger 로 자동 유지.';
