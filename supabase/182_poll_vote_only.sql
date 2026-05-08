-- ──────────────────────────────────────────────
-- 182: 폴 mode 분기 — 'bet' (mlbg 걸고) | 'vote' (단순 투표)
--
-- post_polls.mode 추가, create_post_poll RPC 시그니처 확장 (p_mode 추가),
-- vote_post_poll RPC 부활 (mlbg 차감 없이 1인 1표).
--
-- 사용자가 직접 Supabase Studio (SQL Editor) 에서 이 파일 실행해야 함.
-- ──────────────────────────────────────────────

-- 1) mode 컬럼 추가 + check
alter table public.post_polls
  add column if not exists mode text not null default 'bet';
alter table public.post_polls drop constraint if exists post_polls_mode_check;
alter table public.post_polls add constraint post_polls_mode_check check (mode in ('bet','vote'));

-- 2) create_post_poll 시그니처 확장 — p_mode 추가
drop function if exists public.create_post_poll(bigint, text, text[]);
drop function if exists public.create_post_poll(bigint, text, text[], text);
create or replace function public.create_post_poll(
  p_post_id bigint, p_question text, p_options text[], p_mode text default 'bet'
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_label text;
  v_idx int := 0;
  v_mode text := coalesce(p_mode, 'bet');
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  if v_mode not in ('bet','vote') then v_mode := 'bet'; end if;
  if p_options is null or array_length(p_options, 1) is null or array_length(p_options, 1) < 2 then
    return query select false, '옵션은 2개 이상'::text; return;
  end if;
  if array_length(p_options, 1) > 6 then
    return query select false, '옵션은 최대 6개'::text; return;
  end if;
  select author_id into v_author from public.posts where id = p_post_id and deleted_at is null;
  if v_author is null then return query select false, '글을 찾을 수 없어요'::text; return; end if;
  if v_author <> v_uid then return query select false, '본인 글에만 투표 추가 가능'::text; return; end if;
  if exists(select 1 from public.post_polls where post_id = p_post_id) then
    return query select false, '이미 투표가 등록됨'::text; return;
  end if;

  insert into public.post_polls (post_id, question, mode)
    values (p_post_id, nullif(trim(coalesce(p_question, '')), ''), v_mode);
  foreach v_label in array p_options loop
    if length(trim(v_label)) > 0 then
      insert into public.post_poll_options (post_id, idx, label) values (p_post_id, v_idx, trim(v_label));
      v_idx := v_idx + 1;
    end if;
  end loop;

  return query select true, null::text;
end;
$$;
grant execute on function public.create_post_poll(bigint, text, text[], text) to authenticated;

-- 3) vote_post_poll RPC 부활 — mlbg 차감 없이 1인 1표 (mode='vote' 만)
create or replace function public.vote_post_poll(p_post_id bigint, p_option_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_mode text;
  v_valid int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  select status, mode into v_status, v_mode from public.post_polls where post_id = p_post_id;
  if v_status is null then return query select false, '투표를 찾을 수 없어요'::text; return; end if;
  if v_status <> 'open' then return query select false, '이미 정산됨'::text; return; end if;
  if v_mode <> 'vote' then return query select false, '베팅 폴은 mlbg 걸고 참여'::text; return; end if;
  select count(*) into v_valid from public.post_poll_options where id = p_option_id and post_id = p_post_id;
  if v_valid = 0 then return query select false, '잘못된 옵션'::text; return; end if;
  -- upsert (1인 1표, 변경 가능). amount 는 vote 모드에선 0.
  insert into public.post_poll_votes (post_id, user_id, option_id, amount)
    values (p_post_id, v_uid, p_option_id, 0)
    on conflict (post_id, user_id) do update set option_id = excluded.option_id, created_at = now();
  return query select true, null::text;
end;
$$;
grant execute on function public.vote_post_poll(bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
