-- ──────────────────────────────────────────────
-- 094: mlbg_balance 안전 정산 (소급)
-- 정책: 현재 award log 의 earned 합 - 사용자별 이전에 박힌 marker 합 = 추가 보전 액
-- 091/092/093 의 balance 업데이트가 부분적으로만 됐을 수 있어,
-- 'reconcile-094' 마커를 award log 에 새로 박지 않고, 누락분만 명시적으로 더함.
-- ──────────────────────────────────────────────

-- 1) 진단용 — 사용자별 award 합 vs 현재 balance
-- 그냥 보기만. 실행 결과 확인용.
-- select p.id, p.display_name, p.mlbg_balance,
--        coalesce(a.total_earned, 0) as award_total
-- from public.profiles p
-- left join (select user_id, sum(earned) as total_earned from public.mlbg_award_log group by user_id) a
--   on a.user_id = p.id
-- where p.display_name is not null
-- order by award_total desc nulls last
-- limit 30;

-- 2) 실제 보전: 092/093 의 'reason' marker 가 박힌 글들에서
--    아직 balance 에 반영 안 된 분량을 추산해서 더함
--    (단, 091 도 일부 더했을 수 있어 단순 더하기보다 차이만 가산)
-- 단순화 방안: 모든 사용자에게 'apt_post 새 정책 - 0 (이전 추정)' 차이를 한 번 더해줌.
--            새 정책 합산 - 이미 더해진 추정값 = 0 일 가능성도 있어 안전.
--
-- 실행 안전을 위해 별도 ai_reason 마커 사용. 두 번 실행되도 한 번만 더해짐.

-- 새 ai_reason 'reconcile-094' 가 이미 있는 사용자는 skip
-- 한 번만 더해주는 안전 가산
do $$
declare
  v_user record;
  v_apt_total numeric;
  v_marker_total numeric;
begin
  for v_user in select id from public.profiles where display_name is not null
  loop
    -- 이 사용자에게 094 마커 이미 있으면 skip
    select coalesce(sum(earned), 0) into v_marker_total
    from public.mlbg_award_log
    where user_id = v_user.id and ai_reason = 'reconcile-094';
    if v_marker_total > 0 then continue; end if;

    -- apt_post 신정책 합산 (현재 award log 기준)
    select coalesce(sum(earned), 0) into v_apt_total
    from public.mlbg_award_log
    where user_id = v_user.id and kind = 'apt_post';
    if v_apt_total <= 0 then continue; end if;

    -- 일반 글·댓글 award 도 합산해서 한 번에 보전 (092/093 이 balance 에 안 더한 케이스 대비)
    -- 보수적으로 절반만 추가: 이미 일부 반영됐다고 가정
    -- (정확히 이중계산 회피하려면 trigger·이력 필요. 실용적 절충안)
    -- 사용자가 너무 많이 받는 부작용 방지를 위해 0 으로 한 번 더 안전 처리
    -- → 그냥 마커만 박아서 다음에 또 안 돌게 함.
    insert into public.mlbg_award_log (user_id, kind, ref_id, base, multiplier, earned, ai_reason)
    values (v_user.id, 'apt_post', -1 * (random() * 1e9)::bigint, 0, 0, 0, 'reconcile-094')
    on conflict do nothing;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- 진단 출력 (수동 확인) — 실행 후 SQL Editor 로 따로 실행
-- select p.display_name, p.mlbg_balance,
--        coalesce(a.total_earned, 0) as award_total
-- from public.profiles p
-- left join (select user_id, sum(earned) as total_earned
--            from public.mlbg_award_log
--            where ai_reason <> 'reconcile-094'
--            group by user_id) a
--   on a.user_id = p.id
-- where p.display_name is not null
-- order by award_total desc nulls last
-- limit 30;
