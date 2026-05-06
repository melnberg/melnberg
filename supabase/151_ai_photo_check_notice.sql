-- ──────────────────────────────────────────────
-- 151: AI 사진 검증 도입 공지 — 피드 + 모든 사용자 알림
-- 145 와 동일 패턴 (site_announcements + admin_notice broadcast)
-- ──────────────────────────────────────────────

-- 1) 피드 상단 공지
insert into public.site_announcements (title, body, link_url, created_by)
values (
  '🤖 AI 사진 검증 도입 — 지도 캡처 / 스크린샷 자동 삭제',
  E'맛집·육아 장소 등록 시 사진을 AI 가 자동 검증함.\n\n' ||
  E'· 카카오맵·네이버지도·구글맵 등 지도 앱 캡처\n' ||
  E'· 검색 결과 / 앱 UI 스크린샷\n' ||
  E'→ 등록 자체가 차단됨. 우회해서 등록된 경우에도 AI 에이전트가 사후 자동 삭제.\n\n' ||
  E'캡처 말고 사진을 올려주세요. 위반 시 받은 +30 mlbg 도 회수됨.',
  '/restaurants',
  coalesce(
    (select created_by from public.site_announcements where created_by is not null order by created_at desc limit 1),
    (select id from auth.users order by created_at asc limit 1)
  )
);

-- 2) 모든 사용자에게 admin_notice 알림 (종 빨간 점)
insert into public.notifications (recipient_id, type, actor_name, comment_excerpt)
  select id, 'admin_notice', '멜른버그 운영',
    '🤖 AI 사진 검증 도입. 맛집·육아 장소 등록 시 지도 캡처/스크린샷은 자동 차단됨. 실제 장소 사진만 올려주세요.'
  from public.profiles;

notify pgrst, 'reload schema';
