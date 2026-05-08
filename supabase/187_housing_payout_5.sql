-- ──────────────────────────────────────────────
-- 187: 주택 보유자 보유 주택 가격의 5% 일괄 배당
-- - apt_master.occupier_id != null 인 모든 주택 가치 합산 후 5% 지급
-- - 가치 = get_user_apt_assets RPC 의 value (실거래 우선, 없으면 분양가)
-- - 한 번만 지급. site_announcements 1건.
-- - 알림은 facility_income_auto 타입 재사용 (별도 타입 추가 안 해도 안전).
-- ──────────────────────────────────────────────

do $$
declare
  v_admin uuid;
begin
  -- 1) 사용자별 보유 주택 평가합 산출 + balance 5% 지급 + 알림.
  with users_with_apts as (
    select distinct occupier_id as uid
    from public.apt_master
    where occupier_id is not null
  ),
  user_value as (
    select u.uid,
           coalesce((
             select sum(a.value)
             from public.get_user_apt_assets(u.uid) a
           ), 0) as total_value
    from users_with_apts u
  ),
  payouts as (
    select uid,
           round(total_value * 0.05)::numeric as payout
    from user_value
    where total_value > 0
  ),
  upd as (
    update public.profiles p
    set mlbg_balance = coalesce(p.mlbg_balance, 0) + py.payout
    from payouts py
    where p.id = py.uid and py.payout > 0
    returning py.uid as user_id, py.payout
  )
  insert into public.notifications (recipient_id, type, comment_excerpt, actor_name)
  select user_id,
         'facility_income_auto',
         '주택 보유 보너스 (5% 일괄 배당): +' || payout::text || ' mlbg',
         '시스템'
  from upd;

  -- 2) 운영 공지 (어드민 있을 때만)
  select id into v_admin from public.profiles where is_admin = true limit 1;
  if v_admin is not null then
    insert into public.site_announcements (title, body, created_by)
    values ('🏠 주택 보유 5% 일괄 배당',
            '주택 점거자에게 보유 주택 평가액의 5% 가 mlbg 잔액으로 일괄 지급됨. 1회성 보너스.',
            v_admin);
  end if;
end $$;

notify pgrst, 'reload schema';
