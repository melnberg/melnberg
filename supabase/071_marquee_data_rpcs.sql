-- ──────────────────────────────────────────────
-- 071: 마퀴 추가 데이터 RPC (E/F/G/H/I)
-- E. 오늘의 활동 지표 — 글/댓글/가입/출석 카운트
-- F. AI 고평가 글 TOP — multiplier >= 1.4
-- G. 오늘의 매매 체결 — sell 이벤트
-- H. 진행중 호가 — 사이트 전체 pending offers
-- I. 핫딜 최신글
-- ──────────────────────────────────────────────

-- ── E. 오늘 활동 ─────────────────────────────────
create or replace function public.get_today_activity()
returns table(
  posts_today bigint,
  apt_posts_today bigint,
  comments_today bigint,
  apt_comments_today bigint,
  new_users_today bigint,
  checkins_today bigint,
  claims_today bigint
)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_today_start timestamptz := (((current_timestamp at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul');
begin
  return query select
    (select count(*) from public.posts where created_at >= v_today_start and (deleted_at is null))::bigint,
    (select count(*) from public.apt_discussions where created_at >= v_today_start and (deleted_at is null))::bigint,
    (select count(*) from public.comments where created_at >= v_today_start and (deleted_at is null))::bigint,
    (select count(*) from public.apt_discussion_comments where created_at >= v_today_start and (deleted_at is null))::bigint,
    (select count(*) from public.profiles where created_at >= v_today_start)::bigint,
    (select count(*) from public.profiles where last_checkin_date = ((current_timestamp at time zone 'Asia/Seoul')::date))::bigint,
    (select count(*) from public.apt_occupier_events where event = 'claim' and occurred_at >= v_today_start)::bigint;
exception when others then
  -- deleted_at 미존재 환경 fallback
  return query select
    (select count(*) from public.posts where created_at >= v_today_start)::bigint,
    (select count(*) from public.apt_discussions where created_at >= v_today_start)::bigint,
    (select count(*) from public.comments where created_at >= v_today_start)::bigint,
    (select count(*) from public.apt_discussion_comments where created_at >= v_today_start)::bigint,
    (select count(*) from public.profiles where created_at >= v_today_start)::bigint,
    0::bigint,
    (select count(*) from public.apt_occupier_events where event = 'claim' and occurred_at >= v_today_start)::bigint;
end;
$$;
grant execute on function public.get_today_activity() to anon, authenticated;

-- ── F. AI 고평가 글 TOP ──────────────────────────
create or replace function public.get_top_quality_awards(p_limit int default 10)
returns table(
  kind text,
  ref_id bigint,
  earned numeric,
  multiplier numeric,
  title text,
  apt_nm text,
  author_name text,
  created_at timestamptz
)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  return query
  select
    log.kind,
    log.ref_id,
    log.earned,
    log.multiplier,
    coalesce(
      (case
        when log.kind = 'apt_post' then (select d.title from public.apt_discussions d where d.id = log.ref_id)
        when log.kind = 'community_post' then (select p.title from public.posts p where p.id = log.ref_id)
        when log.kind = 'hotdeal_post' then (select p.title from public.posts p where p.id = log.ref_id)
        when log.kind = 'apt_comment' then (select left(c.content, 60) from public.apt_discussion_comments c where c.id = log.ref_id)
        when log.kind = 'community_comment' then (select left(c.content, 60) from public.comments c where c.id = log.ref_id)
        when log.kind = 'hotdeal_comment' then (select left(c.content, 60) from public.comments c where c.id = log.ref_id)
        else null
      end), '(삭제됨)'
    ) as title,
    (case
      when log.kind = 'apt_post' then (select am.apt_nm from public.apt_discussions d join public.apt_master am on am.id = d.apt_master_id where d.id = log.ref_id)
      when log.kind = 'apt_comment' then (select am.apt_nm from public.apt_discussion_comments c join public.apt_discussions d on d.id = c.discussion_id join public.apt_master am on am.id = d.apt_master_id where c.id = log.ref_id)
      else null
    end) as apt_nm,
    (select p.display_name from public.profiles p where p.id = log.user_id) as author_name,
    log.created_at
  from public.mlbg_award_log log
  where log.multiplier >= 1.3
  order by log.multiplier desc, log.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;
grant execute on function public.get_top_quality_awards(int) to anon, authenticated;

-- ── G. 오늘의 매매 체결 ──────────────────────────
create or replace function public.get_today_sells(p_limit int default 10)
returns table(
  apt_id bigint,
  apt_nm text,
  buyer_name text,
  seller_name text,
  price numeric,
  occurred_at timestamptz
)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_today_start timestamptz := (((current_timestamp at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul');
begin
  return query
  select
    e.apt_id,
    am.apt_nm,
    e.actor_name as buyer_name,
    e.prev_occupier_name as seller_name,
    e.actor_score as price,    -- sell 이벤트는 actor_score 에 가격 저장
    e.occurred_at
  from public.apt_occupier_events e
  left join public.apt_master am on am.id = e.apt_id
  where e.event = 'sell'
    and e.occurred_at >= v_today_start
  order by e.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;
grant execute on function public.get_today_sells(int) to anon, authenticated;

-- ── H. 사이트 전체 진행중 호가 ───────────────────
create or replace function public.get_active_offers(p_limit int default 20)
returns table(
  offer_id bigint,
  apt_id bigint,
  apt_nm text,
  buyer_name text,
  price numeric,
  kind text,
  created_at timestamptz
)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  return query
  select
    o.id as offer_id,
    o.apt_id,
    am.apt_nm,
    p.display_name as buyer_name,
    o.price,
    o.kind,
    o.created_at
  from public.apt_listing_offers o
  left join public.apt_master am on am.id = o.apt_id
  left join public.profiles p on p.id = o.buyer_id
  where o.status = 'pending'
  order by o.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;
grant execute on function public.get_active_offers(int) to anon, authenticated;

-- ── I. 핫딜 최신글 ─────────────────────────────
create or replace function public.get_recent_hotdeals(p_limit int default 10)
returns table(
  post_id bigint,
  title text,
  author_name text,
  created_at timestamptz
)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  return query
  select
    p.id as post_id,
    p.title,
    pr.display_name as author_name,
    p.created_at
  from public.posts p
  left join public.profiles pr on pr.id = p.author_id
  where p.category = 'hotdeal'
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 30));
exception when others then
  -- deleted_at 컬럼 없을 때 그대로 그래도 작동 (필터 안 걸어둠)
  return;
end;
$$;
grant execute on function public.get_recent_hotdeals(int) to anon, authenticated;
