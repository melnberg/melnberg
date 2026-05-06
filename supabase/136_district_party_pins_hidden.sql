-- ──────────────────────────────────────────────
-- 136: 구청·시청 정당핀 전체 환불 + 삭제 (선관위 리스크 회피)
-- 134 의 50핀 (party_dem / party_ppl × 25개소) 을 일괄 비공개·환불.
-- 1) 점거자 전원 분양가 환불
-- 2) 매물(factory_listings) 삭제
-- 3) 점거(factory_occupations) 삭제
-- 4) 위치(factory_locations) 삭제 (region_code IS NOT NULL 인 party_dem/ppl 만)
-- 5) 기존 발효 공지 soft-delete + 새 안내 공지 INSERT
-- ──────────────────────────────────────────────

-- 1) 점거자 환불 — 분양가만큼 mlbg_balance 가산
update public.profiles p
  set mlbg_balance = coalesce(p.mlbg_balance, 0) + f.occupy_price
  from public.factory_occupations fo
  join public.factory_locations f on f.id = fo.factory_id
  where p.id = fo.user_id
    and f.brand in ('party_dem', 'party_ppl')
    and f.region_code is not null;

-- 2) 매물 삭제
delete from public.factory_listings fl
  using public.factory_locations f
  where fl.factory_id = f.id
    and f.brand in ('party_dem', 'party_ppl')
    and f.region_code is not null;

-- 3) 점거 삭제
delete from public.factory_occupations fo
  using public.factory_locations f
  where fo.factory_id = f.id
    and f.brand in ('party_dem', 'party_ppl')
    and f.region_code is not null;

-- 4) 위치(핀) 삭제
delete from public.factory_locations
  where brand in ('party_dem', 'party_ppl')
    and region_code is not null;

-- 5) 기존 "분양 시작" 공지 soft-delete
update public.site_announcements
  set deleted_at = now()
  where title = '🏛️ 서울 25개 구청·시청 정당핀 분양 시작'
    and deleted_at is null;

-- 6) 새 안내 공지 INSERT — 가린 이유 설명
insert into public.site_announcements(title, body, link_url, created_by)
values (
  '🚫 구청·시청 정당핀 비공개 처리',
  E'어제 추가했던 서울 25개 구청·시청 정당핀(더불어민주당 / 국민의힘) 50개를 모두 비공개 처리했어요.\n\n' ||
  E'· 사유: 6/3 지방선거 정산 룰이 선거관리위원회 (선관위) 사전선거운동 / 후원 제한 조항에 저촉될 가능성 있음 → 사전 차단\n' ||
  E'· 점거하셨던 분들은 분양가 200 mlbg 전액 자동 환불 완료\n' ||
  E'· 본부 7개 (영등포구 여의도) 정당핀은 그대로 유지',
  '/',
  coalesce(
    (select created_by from public.site_announcements where created_by is not null order by created_at desc limit 1),
    (select id from auth.users order by created_at asc limit 1)
  )
);

notify pgrst, 'reload schema';
