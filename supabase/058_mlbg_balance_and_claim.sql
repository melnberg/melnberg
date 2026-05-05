-- ──────────────────────────────────────────────
-- 058: mlbg 잔액 + 분양가 + 1인 1주택 폐기 + 비용 차감
-- ──────────────────────────────────────────────

-- 1) profiles.mlbg_balance — 저장된 잔액 (기존 적립 점수 = 초기 잔액)
alter table public.profiles
  add column if not exists mlbg_balance numeric not null default 0;

-- 기존 사용자 잔액 초기화 (한 번만 — 이미 0 이 아니면 건드리지 않음)
update public.profiles p
set mlbg_balance = public.get_user_score(p.id)
where p.mlbg_balance = 0;

comment on column public.profiles.mlbg_balance is '현재 보유 mlbg 잔액. 활동으로 적립, 분양·매매로 차감/적립.';

-- 2) 단지 분양가 (구별)
create or replace function public.get_apt_listing_price(p_lawd_cd text)
returns int
language sql
immutable
as $$
  select case
    when p_lawd_cd = '11650' then 240  -- 서초구
    when p_lawd_cd = '11680' then 233  -- 강남구
    when p_lawd_cd = '11710' then 181  -- 송파구
    when p_lawd_cd = '11170' then 180  -- 용산구
    when p_lawd_cd = '11200' then 151  -- 성동구
    when p_lawd_cd = '11215' then 148  -- 광진구
    when p_lawd_cd = '11440' then 129  -- 마포구
    when p_lawd_cd = '11590' then 125  -- 동작구
    when p_lawd_cd = '11740' then 116  -- 강동구
    when p_lawd_cd = '11140' then 116  -- 중구
    when p_lawd_cd = '11110' then 109  -- 종로구
    when p_lawd_cd = '11560' then 107  -- 영등포구
    when p_lawd_cd = '11470' then 95   -- 양천구
    when p_lawd_cd = '11230' then 85   -- 동대문구
    when p_lawd_cd = '11410' then 80   -- 서대문구
    when p_lawd_cd = '11500' then 75   -- 강서구
    when p_lawd_cd = '11290' then 72   -- 성북구
    when p_lawd_cd = '11380' then 60   -- 은평구
    when p_lawd_cd = '11260' then 52   -- 중랑구
    when p_lawd_cd = '11545' then 20   -- 금천구
    when p_lawd_cd = '11620' then 20   -- 관악구
    when p_lawd_cd = '11530' then 20   -- 구로구
    when p_lawd_cd = '11350' then 20   -- 노원구
    when p_lawd_cd = '11320' then 20   -- 도봉구
    when p_lawd_cd = '11305' then 20   -- 강북구
    when left(p_lawd_cd, 2) = '41' then 15  -- 경기도 전체
    when left(p_lawd_cd, 2) = '28' then 5   -- 인천 전체
    else 50  -- 그 외 (대전·대구 등) 기본
  end;
$$;

grant execute on function public.get_apt_listing_price(text) to anon, authenticated;
comment on function public.get_apt_listing_price is '단지 lawd_cd 기준 분양가 (mlbg). 빈 단지 분양받을 때 차감 금액.';

-- 3) claim_apt 재정의 — 1인 1주택 폐기 + 비용 차감
-- 변경:
--   · 본인이 다른 곳 점거중이어도 자동 vacate 안 함 (다주택 허용)
--   · 잔액 부족 시 거부
--   · 성공 시 mlbg_balance 차감
drop function if exists public.claim_apt(bigint);
create or replace function public.claim_apt(p_apt_id bigint)
returns table(
  out_success boolean,
  out_occupier_id uuid,
  out_occupier_name text,
  out_occupier_score numeric,
  out_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_occ uuid;
  v_apt_lawd text;
  v_price int;
  v_balance numeric;
  v_name text;
begin
  if v_uid is null then
    return query select false, null::uuid, null::text, 0::numeric, '로그인이 필요해요'::text;
    return;
  end if;

  select am.occupier_id, am.lawd_cd into v_existing_occ, v_apt_lawd
    from public.apt_master am where am.id = p_apt_id;

  -- 다른 사람 보유 중 → 매매로만 인수
  if v_existing_occ is not null and v_existing_occ <> v_uid then
    select display_name into v_name from public.profiles where id = v_existing_occ;
    return query select false, v_existing_occ, v_name, public.get_user_score(v_existing_occ),
      ('이미 ' || coalesce(v_name, '다른 사용자') || ' 님이 분양받은 단지입니다. 매매로만 인수 가능.')::text;
    return;
  end if;

  -- 본인이 이미 보유 → no-op
  if v_existing_occ = v_uid then
    select display_name into v_name from public.profiles where id = v_uid;
    return query select true, v_uid, v_name, public.get_user_score(v_uid), '이미 보유중'::text;
    return;
  end if;

  -- 분양가 + 잔액 검증
  v_price := public.get_apt_listing_price(v_apt_lawd);
  select coalesce(mlbg_balance, 0) into v_balance from public.profiles where id = v_uid;
  if v_balance < v_price then
    return query select false, null::uuid, null::text, v_balance,
      ('잔액 부족 — 분양가 ' || v_price || ' mlbg / 보유 ' || v_balance || ' mlbg')::text;
    return;
  end if;

  -- 차감 + 분양
  update public.profiles set mlbg_balance = mlbg_balance - v_price where id = v_uid;
  update public.apt_master set occupier_id = v_uid, occupied_at = now() where id = p_apt_id;
  select display_name into v_name from public.profiles where id = v_uid;

  insert into public.apt_occupier_events(apt_id, event, actor_id, actor_name, actor_score)
    values (p_apt_id, 'claim', v_uid, v_name, public.get_user_score(v_uid));

  return query select true, v_uid, v_name, public.get_user_score(v_uid), null::text;
end;
$$;

grant execute on function public.claim_apt(bigint) to authenticated;
comment on function public.claim_apt is '빈 단지 분양받기. 잔액 차감. 1인 1주택 제약 없음.';

-- 4) 활동 적립 트리거 — 글/댓글 INSERT 시 mlbg_balance 자동 증가
-- 가중치: 아파트글 1 / 아파트 댓글 0.5 / 커뮤글 2 / 커뮤댓글 0.3

create or replace function public.mlbg_earn_apt_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is null then return new; end if;
  update public.profiles set mlbg_balance = mlbg_balance + 1.0 where id = new.author_id;
  return new;
end;
$$;
drop trigger if exists trg_mlbg_earn_apt_post on public.apt_discussions;
create trigger trg_mlbg_earn_apt_post
  after insert on public.apt_discussions
  for each row execute function public.mlbg_earn_apt_post();

create or replace function public.mlbg_earn_apt_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is null then return new; end if;
  update public.profiles set mlbg_balance = mlbg_balance + 0.5 where id = new.author_id;
  return new;
end;
$$;
drop trigger if exists trg_mlbg_earn_apt_comment on public.apt_discussion_comments;
create trigger trg_mlbg_earn_apt_comment
  after insert on public.apt_discussion_comments
  for each row execute function public.mlbg_earn_apt_comment();

create or replace function public.mlbg_earn_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is null then return new; end if;
  update public.profiles set mlbg_balance = mlbg_balance + 2.0 where id = new.author_id;
  return new;
end;
$$;
drop trigger if exists trg_mlbg_earn_post on public.posts;
create trigger trg_mlbg_earn_post
  after insert on public.posts
  for each row execute function public.mlbg_earn_post();

create or replace function public.mlbg_earn_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is null then return new; end if;
  update public.profiles set mlbg_balance = mlbg_balance + 0.3 where id = new.author_id;
  return new;
end;
$$;
drop trigger if exists trg_mlbg_earn_comment on public.comments;
create trigger trg_mlbg_earn_comment
  after insert on public.comments
  for each row execute function public.mlbg_earn_comment();

comment on function public.mlbg_earn_apt_post is '아파트 토론 글 INSERT → 작성자 mlbg_balance += 1';
comment on function public.mlbg_earn_apt_comment is '아파트 토론 댓글 INSERT → 작성자 mlbg_balance += 0.5';
comment on function public.mlbg_earn_post is '커뮤니티 글 INSERT → 작성자 mlbg_balance += 2';
comment on function public.mlbg_earn_comment is '커뮤니티 댓글 INSERT → 작성자 mlbg_balance += 0.3';
