-- ──────────────────────────────────────────────
-- 177: 폴 → mlbg 베팅·정산 (parimutuel)
--
-- post_polls: status (open/resolved) + correct_option_id + resolved_at
-- post_poll_votes: amount 추가 (mlbg 베팅액). 1인 1번 (PK 그대로).
-- bet_post_poll RPC — vote_post_poll 대체. 잔액 검증·차감 + insert.
-- resolve_post_poll RPC — 작성자만, 정답 결정 + parimutuel 정산.
-- ──────────────────────────────────────────────

alter table public.post_polls
  add column if not exists status text not null default 'open',
  add column if not exists correct_option_id bigint references public.post_poll_options(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists total_pool numeric not null default 0;
alter table public.post_polls drop constraint if exists post_polls_status_check;
alter table public.post_polls add constraint post_polls_status_check check (status in ('open', 'resolved'));

alter table public.post_poll_votes
  add column if not exists amount numeric not null default 1,
  add column if not exists payout numeric;  -- 정산 시 받은 액수 (없으면 NULL)

create index if not exists post_poll_votes_post_idx on public.post_poll_votes(post_id);

-- 기존 vote_post_poll 은 유지하되 비활성화 — 잔액 차감 없이 동작하면 위험
-- bet_post_poll 가 신표준
drop function if exists public.vote_post_poll(bigint, bigint);

create or replace function public.bet_post_poll(p_post_id bigint, p_option_id bigint, p_amount numeric)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_valid int;
  v_balance numeric;
  v_existing int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  if p_amount is null or p_amount < 1 then return query select false, '최소 1 mlbg'::text; return; end if;

  select status into v_status from public.post_polls where post_id = p_post_id;
  if v_status is null then return query select false, '투표를 찾을 수 없어요'::text; return; end if;
  if v_status <> 'open' then return query select false, '이미 정산된 투표'::text; return; end if;

  -- option_id 가 해당 post 의 옵션이 맞는지
  select count(*) into v_valid from public.post_poll_options where id = p_option_id and post_id = p_post_id;
  if v_valid = 0 then return query select false, '잘못된 옵션'::text; return; end if;

  -- 1인 1번 — 이미 베팅했으면 변경 불가
  select count(*) into v_existing from public.post_poll_votes where post_id = p_post_id and user_id = v_uid;
  if v_existing > 0 then return query select false, '이미 베팅함 (변경 불가)'::text; return; end if;

  -- 잔액 검증·차감
  select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid;
  if v_balance < p_amount then return query select false, format('잔액 부족 (현재: %s mlbg)', v_balance)::text; return; end if;

  update public.profiles set mlbg_balance = mlbg_balance - p_amount where id = v_uid;
  insert into public.post_poll_votes (post_id, user_id, option_id, amount)
    values (p_post_id, v_uid, p_option_id, p_amount);
  update public.post_polls set total_pool = total_pool + p_amount where post_id = p_post_id;

  return query select true, null::text;
end;
$$;
grant execute on function public.bet_post_poll(bigint, bigint, numeric) to authenticated;

-- 정산 RPC — 작성자만. 정답 옵션 받아서 parimutuel 정산.
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
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text, 0::numeric, 0::numeric; return; end if;

  select author_id into v_author from public.posts where id = p_post_id and deleted_at is null;
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
    end loop;
    update public.post_poll_votes set payout = amount where post_id = p_post_id;
  else
    -- parimutuel: 정답에 건 사람들이 (자기 베팅 / 정답 풀) * 전체 풀 받음
    for v_vote in select user_id, amount, option_id from public.post_poll_votes where post_id = p_post_id loop
      if v_vote.option_id = p_correct_option_id then
        v_payout := (v_vote.amount / v_winner_pool) * v_total;
        update public.profiles set mlbg_balance = coalesce(mlbg_balance, 0) + v_payout where id = v_vote.user_id;
        update public.post_poll_votes set payout = v_payout
          where post_id = p_post_id and user_id = v_vote.user_id;
      else
        update public.post_poll_votes set payout = 0
          where post_id = p_post_id and user_id = v_vote.user_id;
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
