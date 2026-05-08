-- ──────────────────────────────────────────────
-- 184: 투표/베팅 종료일자
-- - post_polls.ends_at 컬럼 추가
-- - create_post_poll 시그니처 확장 (p_ends_at)
-- - bet_post_poll / vote_post_poll 종료 체크 추가
-- ──────────────────────────────────────────────

alter table public.post_polls
  add column if not exists ends_at timestamptz;

-- 시그니처 변경 → 기존 함수 drop 후 재생성
drop function if exists public.create_post_poll(bigint, text, text[]);
drop function if exists public.create_post_poll(bigint, text, text[], text);
drop function if exists public.create_post_poll(bigint, text, text[], text, timestamptz);

create or replace function public.create_post_poll(
  p_post_id bigint,
  p_question text,
  p_options text[],
  p_mode text default 'bet',
  p_ends_at timestamptz default null
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_label text;
  v_idx int := 0;
  v_mode text := lower(coalesce(p_mode, 'bet'));
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  if v_mode not in ('bet','vote') then return query select false, '잘못된 모드'::text; return; end if;
  if p_options is null or array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    return query select false, '옵션은 2개 이상'::text; return;
  end if;
  if array_length(p_options, 1) > 6 then return query select false, '옵션은 최대 6개'::text; return; end if;
  if p_ends_at is not null and p_ends_at <= now() then return query select false, '종료일은 미래여야 함'::text; return; end if;
  select author_id into v_author from public.posts where id = p_post_id and deleted_at is null;
  if v_author is null then return query select false, '글을 찾을 수 없어요'::text; return; end if;
  if v_author <> v_uid then return query select false, '본인 글에만 투표 추가 가능'::text; return; end if;
  if exists(select 1 from public.post_polls where post_id = p_post_id) then return query select false, '이미 투표가 등록됨'::text; return; end if;

  insert into public.post_polls (post_id, question, mode, ends_at)
    values (p_post_id, nullif(trim(coalesce(p_question, '')), ''), v_mode, p_ends_at);
  foreach v_label in array p_options loop
    if length(trim(v_label)) > 0 then
      insert into public.post_poll_options (post_id, idx, label) values (p_post_id, v_idx, trim(v_label));
      v_idx := v_idx + 1;
    end if;
  end loop;

  return query select true, null::text;
end;
$$;
grant execute on function public.create_post_poll(bigint, text, text[], text, timestamptz) to authenticated;

-- bet_post_poll — ends_at 체크 추가
create or replace function public.bet_post_poll(
  p_post_id bigint, p_option_id bigint, p_amount numeric
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_mode text;
  v_ends timestamptz;
  v_valid int;
  v_balance numeric;
  v_existing int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  if p_amount is null or p_amount < 1 then return query select false, '최소 1 mlbg'::text; return; end if;
  select status, mode, ends_at into v_status, v_mode, v_ends from public.post_polls where post_id = p_post_id;
  if v_status is null then return query select false, '투표를 찾을 수 없어요'::text; return; end if;
  if v_status <> 'open' then return query select false, '이미 정산됨'::text; return; end if;
  if v_ends is not null and v_ends < now() then
    return query select false, ('베팅 마감 (' || to_char(v_ends, 'YYYY-MM-DD HH24:MI') || ')')::text; return;
  end if;
  if coalesce(v_mode, 'bet') = 'vote' then return query select false, '베팅 가능한 폴이 아님 (vote 모드)'::text; return; end if;
  select count(*) into v_valid from public.post_poll_options where id = p_option_id and post_id = p_post_id;
  if v_valid = 0 then return query select false, '잘못된 옵션'::text; return; end if;
  select count(*) into v_existing from public.post_poll_votes where post_id = p_post_id and user_id = v_uid;
  if v_existing > 0 then return query select false, '이미 베팅함'::text; return; end if;
  select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid;
  if v_balance < p_amount then return query select false, format('잔액 부족 (현재: %s)', v_balance)::text; return; end if;
  update public.profiles set mlbg_balance = mlbg_balance - p_amount where id = v_uid;
  insert into public.post_poll_votes (post_id, user_id, option_id, amount) values (p_post_id, v_uid, p_option_id, p_amount);
  update public.post_polls set total_pool = coalesce(total_pool, 0) + p_amount where post_id = p_post_id;
  return query select true, null::text;
end;
$$;
grant execute on function public.bet_post_poll(bigint, bigint, numeric) to authenticated;

-- vote_post_poll — ends_at 체크 추가
create or replace function public.vote_post_poll(
  p_post_id bigint, p_option_id bigint
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_mode text;
  v_ends timestamptz;
  v_valid int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select status, mode, ends_at into v_status, v_mode, v_ends from public.post_polls where post_id = p_post_id;
  if v_status is null then return query select false, '투표를 찾을 수 없어요'::text; return; end if;
  if v_status <> 'open' then return query select false, '이미 정산됨'::text; return; end if;
  if v_ends is not null and v_ends < now() then
    return query select false, '투표 마감'::text; return;
  end if;
  if coalesce(v_mode, 'bet') <> 'vote' then return query select false, '베팅 폴은 mlbg 걸고 참여'::text; return; end if;
  select count(*) into v_valid from public.post_poll_options where id = p_option_id and post_id = p_post_id;
  if v_valid = 0 then return query select false, '잘못된 옵션'::text; return; end if;
  insert into public.post_poll_votes (post_id, user_id, option_id, amount)
    values (p_post_id, v_uid, p_option_id, 0)
    on conflict (post_id, user_id) do update set option_id = excluded.option_id, created_at = now();
  return query select true, null::text;
end;
$$;
grant execute on function public.vote_post_poll(bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
