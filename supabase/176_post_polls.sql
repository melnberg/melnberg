-- ──────────────────────────────────────────────
-- 176: 게시글 투표 (1인 1표 단일선택)
--
-- post_polls — post 당 1개 폴 (post_id PK)
-- post_poll_options — 폴의 옵션들 (poll_id, idx 로 정렬, label)
-- post_poll_votes — 누가 어느 옵션 찍었는지 (poll_id+user_id PK = 1인 1표)
-- ──────────────────────────────────────────────

create table if not exists public.post_polls (
  post_id bigint primary key references public.posts(id) on delete cascade,
  question text,
  created_at timestamptz not null default now()
);
alter table public.post_polls enable row level security;
drop policy if exists "post_polls readable by all" on public.post_polls;
create policy "post_polls readable by all" on public.post_polls for select using (true);
-- INSERT 는 RPC 통과만

create table if not exists public.post_poll_options (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  idx int not null,
  label text not null check (length(trim(label)) > 0 and length(label) <= 100),
  unique (post_id, idx)
);
create index if not exists post_poll_options_post_idx on public.post_poll_options(post_id, idx);
alter table public.post_poll_options enable row level security;
drop policy if exists "post_poll_options readable by all" on public.post_poll_options;
create policy "post_poll_options readable by all" on public.post_poll_options for select using (true);

create table if not exists public.post_poll_votes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id bigint not null references public.post_poll_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)  -- 1인 1표
);
create index if not exists post_poll_votes_option_idx on public.post_poll_votes(option_id);
alter table public.post_poll_votes enable row level security;
drop policy if exists "post_poll_votes readable by all" on public.post_poll_votes;
create policy "post_poll_votes readable by all" on public.post_poll_votes for select using (true);
-- INSERT 는 RPC 통과만

-- 폴 + 옵션 일괄 생성 RPC. PostForm 글 작성 직후 호출.
-- 작성자만 호출 가능 (본인 글에만 폴 추가).
create or replace function public.create_post_poll(
  p_post_id bigint, p_question text, p_options text[]
)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_label text;
  v_idx int := 0;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
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

  insert into public.post_polls (post_id, question)
    values (p_post_id, nullif(trim(coalesce(p_question, '')), ''));
  foreach v_label in array p_options loop
    if length(trim(v_label)) > 0 then
      insert into public.post_poll_options (post_id, idx, label) values (p_post_id, v_idx, trim(v_label));
      v_idx := v_idx + 1;
    end if;
  end loop;

  return query select true, null::text;
end;
$$;
grant execute on function public.create_post_poll(bigint, text, text[]) to authenticated;

-- 투표 RPC. 1인 1표 — 이미 투표했으면 변경 (option_id 갱신).
create or replace function public.vote_post_poll(p_post_id bigint, p_option_id bigint)
returns table(out_success boolean, out_message text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_valid int;
begin
  if v_uid is null then return query select false, '로그인이 필요해요'::text; return; end if;
  -- option_id 가 해당 post 의 폴 옵션이 맞는지 검증
  select count(*) into v_valid from public.post_poll_options where id = p_option_id and post_id = p_post_id;
  if v_valid = 0 then return query select false, '잘못된 옵션'::text; return; end if;
  -- upsert (1인 1표)
  insert into public.post_poll_votes (post_id, user_id, option_id)
    values (p_post_id, v_uid, p_option_id)
    on conflict (post_id, user_id) do update set option_id = excluded.option_id, created_at = now();
  return query select true, null::text;
end;
$$;
grant execute on function public.vote_post_poll(bigint, bigint) to authenticated;

notify pgrst, 'reload schema';
