-- ──────────────────────────────────────────────
-- 181: 베팅 정산 시 참가자 알림
--
-- 1) notifications type 에 'poll_settled' 추가
-- 2) resolve_post_poll RPC 갱신 — 정산 후 베팅 참가자 전원에게 알림 insert
--
-- 사용자가 직접 Supabase Studio (SQL Editor) 에서 이 파일 실행해야 함.
-- ──────────────────────────────────────────────

-- 1) notifications type constraint 확장
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'community_comment','apt_comment','apt_evicted','feedback_reply',
    'admin_notice','bio_comment',
    'offer_made','offer_accepted','snatch_made',
    'election_winner','election_loser',
    'restaurant_comment','restaurant_like',
    'kids_comment','kids_like',
    'facility_income_auto',
    'store_comment','store_like',
    'poll_settled'
  ));

-- 2) resolve_post_poll RPC 갱신
drop function if exists public.resolve_post_poll(bigint, bigint);
create or replace function public.resolve_post_poll(p_post_id bigint, p_correct_option_id bigint)
returns table(out_success boolean, out_message text, out_total numeric, out_winner_pool numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_status text;
  v_total numeric;
  v_winner_pool numeric;
  v_valid int;
  v_vote record;
  v_payout numeric;
  v_post_title text;
  v_odds numeric;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric, 0::numeric; return; end if;

  select author_id, title into v_author, v_post_title from public.posts where id = p_post_id and deleted_at is null;
  if v_author is null then return query select false, '글을 찾을 수 없어요'::text, 0::numeric, 0::numeric; return; end if;
  if v_author <> v_uid then return query select false, '작성자만 정산 가능'::text, 0::numeric, 0::numeric; return; end if;

  select status, total_pool into v_status, v_total from public.post_polls where post_id = p_post_id;
  if v_status is null then return query select false, '투표가 없어요'::text, 0::numeric, 0::numeric; return; end if;
  if v_status = 'resolved' then return query select false, '이미 정산됨'::text, 0::numeric, 0::numeric; return; end if;

  select count(*) into v_valid from public.post_poll_options where id = p_correct_option_id and post_id = p_post_id;
  if v_valid = 0 then return query select false, '잘못된 정답 옵션'::text, 0::numeric, 0::numeric; return; end if;

  -- 정답 옵션 풀 합계
  select coalesce(sum(amount), 0) into v_winner_pool
    from public.post_poll_votes where post_id = p_post_id and option_id = p_correct_option_id;

  if v_winner_pool = 0 then
    -- 정답 풀 0 — 모두 환불
    for v_vote in select user_id, amount from public.post_poll_votes where post_id = p_post_id loop
      update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_vote.amount where id = v_vote.user_id;
      insert into public.notifications (user_id, type, title, body, meta)
      values (v_vote.user_id, 'poll_settled',
        '🎰 베팅 정산',
        format('"%s" — 정답에 건 사람이 없어 환불 (%s mlbg)', coalesce(v_post_title,''), v_vote.amount::text),
        jsonb_build_object('post_id', p_post_id, 'amount', v_vote.amount, 'payout', v_vote.amount, 'refund', true));
    end loop;
    update public.post_poll_votes set payout = amount where post_id = p_post_id;
  else
    v_odds := v_total / v_winner_pool;
    for v_vote in select user_id, amount, option_id from public.post_poll_votes where post_id = p_post_id loop
      if v_vote.option_id = p_correct_option_id then
        v_payout := (v_vote.amount / v_winner_pool) * v_total;
        update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_payout where id = v_vote.user_id;
        update public.post_poll_votes set payout = v_payout
          where post_id = p_post_id and user_id = v_vote.user_id;
        insert into public.notifications (user_id, type, title, body, meta)
        values (v_vote.user_id, 'poll_settled',
          '🎉 베팅 적중',
          format('"%s" — %s mlbg 받음 (배당률 %sx)', coalesce(v_post_title,''), round(v_payout)::text, round(v_odds, 2)::text),
          jsonb_build_object('post_id', p_post_id, 'amount', v_vote.amount, 'payout', v_payout, 'won', true));
      else
        update public.post_poll_votes set payout = 0
          where post_id = p_post_id and user_id = v_vote.user_id;
        insert into public.notifications (user_id, type, title, body, meta)
        values (v_vote.user_id, 'poll_settled',
          '🎰 베팅 정산',
          format('"%s" — %s mlbg 잃음', coalesce(v_post_title,''), v_vote.amount::text),
          jsonb_build_object('post_id', p_post_id, 'amount', v_vote.amount, 'payout', 0, 'won', false));
      end if;
    end loop;
  end if;

  update public.post_polls
    set status = 'resolved', correct_option_id = p_correct_option_id, resolved_at = now()
    where post_id = p_post_id;

  return query select true, null::text, v_total, v_winner_pool;
end;
$$;
grant execute on function public.resolve_post_poll(bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
