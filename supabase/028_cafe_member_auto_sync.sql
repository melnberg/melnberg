-- ──────────────────────────────────────────────
-- 028: 카페 유료회원 자동 동기화 트리거
-- 목적: cafe_paid_members에 새 회원이 INSERT 될 때, 그 naver_id로 가입한 회원이
--       이미 있으면 자동으로 tier='paid' 전환. "일괄 동기화" 버튼 사용 안 해도 됨.
-- ──────────────────────────────────────────────

create or replace function public.auto_paid_on_cafe_member_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.naver_id is null or new.naver_id = '' then
    return new;
  end if;
  update public.profiles
    set tier = 'paid', tier_expires_at = '2099-12-31'::timestamptz
    where naver_id = new.naver_id
      and tier <> 'paid';
  return new;
end;
$$;

drop trigger if exists cafe_paid_member_added on public.cafe_paid_members;
create trigger cafe_paid_member_added
  after insert or update of naver_id on public.cafe_paid_members
  for each row execute function public.auto_paid_on_cafe_member_add();

comment on function public.auto_paid_on_cafe_member_add is '카페 유료회원 명부에 추가되는 즉시 매칭되는 가입자를 조합원으로 자동 전환.';
