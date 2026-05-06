-- ──────────────────────────────────────────────
-- 135: 134 정당핀 보강 — 정산 알림 + 핀 발효 공지
-- 1) notifications type check 확장: election_winner / election_loser
-- 2) settle_local_election_2026 — 알림 INSERT 추가
-- 3) site_announcements 에 핀 발효 공지 1건 INSERT (홈 피드 노출용)
-- ──────────────────────────────────────────────

-- 1) 알림 타입 확장
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'community_comment','apt_comment','apt_evicted','feedback_reply',
    'admin_notice','bio_comment',
    'offer_made','offer_accepted','snatch_made',
    'election_winner','election_loser'
  ));

-- 2) 정산 함수 재정의 — 알림 INSERT 포함
create or replace function public.settle_local_election_2026(p_winners jsonb)
returns table(region_code text, winner_brand text, loser_brand text, message text)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_winner text;
  v_loser text;
  v_winner_loc record;
  v_loser_loc record;
  v_winner_occ record;
  v_loser_occ record;
begin
  for r in
    select distinct f.region_code from public.factory_locations f
    where f.brand in ('party_dem', 'party_ppl') and f.region_code is not null
  loop
    v_winner := p_winners ->> r.region_code;
    if v_winner is null or v_winner not in ('party_dem', 'party_ppl') then
      region_code := r.region_code; winner_brand := null; loser_brand := null;
      message := '당선당 미지정 — skip'; return next; continue;
    end if;
    v_loser := case when v_winner = 'party_dem' then 'party_ppl' else 'party_dem' end;

    -- 당선 핀 정보 + 점거자
    select f.* into v_winner_loc
      from public.factory_locations f
      where f.region_code = r.region_code and f.brand = v_winner;
    select fo.* into v_winner_occ
      from public.factory_occupations fo
      where fo.factory_id = v_winner_loc.id;

    -- 낙선 핀 정보 + 점거자 (삭제 전에 알림용)
    select f.* into v_loser_loc
      from public.factory_locations f
      where f.region_code = r.region_code and f.brand = v_loser;
    select fo.* into v_loser_occ
      from public.factory_occupations fo
      where fo.factory_id = v_loser_loc.id;

    -- 당선: daily_income 10 으로 상향 + 점거자에게 알림
    update public.factory_locations
      set daily_income = 10
      where id = v_winner_loc.id;

    if v_winner_occ.user_id is not null then
      insert into public.notifications(recipient_id, type, apt_master_id, actor_name, comment_excerpt)
      values (
        v_winner_occ.user_id, 'election_winner', v_winner_loc.id, '6/3 지방선거 결과',
        v_winner_loc.name || ' 당선! 🎉 일 수익이 1 → 10 mlbg 로 10배 인상됐어요.'
      );
    end if;

    -- 낙선: 점거자에게 알림 → 그 다음 occupations / listings / location 삭제
    if v_loser_occ.user_id is not null then
      insert into public.notifications(recipient_id, type, apt_master_id, actor_name, comment_excerpt, listing_price)
      values (
        v_loser_occ.user_id, 'election_loser', v_loser_loc.id, '6/3 지방선거 결과',
        v_loser_loc.name || ' 낙선 — 분양금 ' || v_loser_loc.occupy_price || ' mlbg 몰수, 핀 사라짐.',
        v_loser_loc.occupy_price
      );
    end if;

    delete from public.factory_occupations where factory_id = v_loser_loc.id;
    delete from public.factory_listings where factory_id = v_loser_loc.id;
    delete from public.factory_locations where id = v_loser_loc.id;

    region_code := r.region_code; winner_brand := v_winner; loser_brand := v_loser;
    message := '정산 완료'; return next;
  end loop;
end;
$$;
grant execute on function public.settle_local_election_2026(jsonb) to service_role;

-- 3) 핀 발효 사이트 공지 — 홈 피드 상단에 노출
-- created_by NOT NULL 이라 기존 site_announcements 의 created_by (어드민) 재사용.
-- 그것도 없으면 auth.users 첫 row.
insert into public.site_announcements(title, body, link_url, created_by)
values (
  '🏛️ 서울 25개 구청·시청 정당핀 분양 시작',
  E'서울 24개 구청 + 서울시청에 더불어민주당(파랑) · 국민의힘(빨강) 핀이 각 1개씩 추가됐어요.\n\n' ||
  E'· 분양가 200 mlbg / 일 수익 1 mlbg\n' ||
  E'· 같은 구청에는 한 사람이 한 핀만 분양 가능 (당 골라야 함)\n' ||
  E'· 6/3 지방선거 결과 — 당선당 핀 일 수익 10배 (10 mlbg/일) / 낙선당 핀 분양금 몰수 + 사라짐\n\n' ||
  E'지도에서 구청 위치 클릭 → 분양받기.',
  '/',
  coalesce(
    (select created_by from public.site_announcements where created_by is not null order by created_at desc limit 1),
    (select id from auth.users order by created_at asc limit 1)
  )
);

notify pgrst, 'reload schema';
