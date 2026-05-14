-- ──────────────────────────────────────────────
-- 201: 이마트 초과이익 국민배당 — 전 회원 1회 5.5 mlbg 동일 지급
--
-- 동작:
--   1) display_name 있는 모든 profiles 에 mlbg_balance += 5.5
--   2) site_announcements 1건 insert (홈 피드 상단 노출)
--   3) 받은 사람 전원에게 notifications insert (type='national_dividend')
--
-- 멱등: 동일 title 의 announcement 가 이미 있으면 skip.
-- 사용자가 직접 Supabase Studio (SQL Editor) 에서 1회 실행.
-- ──────────────────────────────────────────────

-- 1) notifications type 체크 확장 — 181 누적 + 'national_dividend'
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
    'poll_settled',
    'national_dividend'
  ));

-- 2) 지급 + 공지 + 알림 (DO 블록 — 원자적 실행)
do $$
declare
  v_title constant text := '이마트 초과이익 국민배당 — 전 회원 5.5 mlbg 지급';
  v_body  constant text := '이마트 운영 초과이익을 전 회원에게 동일 지급함. 1인당 5.5 mlbg. mlbg 잔액 확인 바람.';
  v_amount constant numeric := 5.5;
  v_admin uuid;
  v_announcement_id bigint;
  v_recipients int;
begin
  -- 멱등성 — 같은 제목 announcement 이미 있으면 종료
  if exists (
    select 1 from public.site_announcements
    where title = v_title and deleted_at is null
  ) then
    raise notice '이미 지급된 배당 (announcement title 중복). skip.';
    return;
  end if;

  -- 어드민 1명 자동 선택 (created_by NOT NULL 충족용)
  select id into v_admin
  from public.profiles
  where is_admin = true
  order by created_at asc
  limit 1;

  if v_admin is null then
    raise exception '어드민 회원이 없어 announcement 작성 불가';
  end if;

  -- 공지 insert
  insert into public.site_announcements (title, body, created_by)
  values (v_title, v_body, v_admin)
  returning id into v_announcement_id;

  -- 전 회원 mlbg_balance += 5.5 + 알림
  with targets as (
    select id from public.profiles where display_name is not null
  ),
  upd as (
    update public.profiles p
    set mlbg_balance = coalesce(p.mlbg_balance, 0) + v_amount
    from targets t
    where p.id = t.id
    returning p.id
  )
  insert into public.notifications (recipient_id, type, comment_excerpt, actor_name)
  select id,
         'national_dividend',
         '💰 이마트 초과이익 국민배당 +' || v_amount::text || ' mlbg 입금됨',
         '시스템'
  from upd;

  get diagnostics v_recipients = row_count;

  raise notice '이마트 초과이익 국민배당 완료 — % 명에게 % mlbg 지급 (총 % mlbg), announcement_id=%',
    v_recipients, v_amount, (v_recipients * v_amount), v_announcement_id;
end $$;

notify pgrst, 'reload schema';
