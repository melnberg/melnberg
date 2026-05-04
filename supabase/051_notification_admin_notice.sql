-- ──────────────────────────────────────────────
-- 051: notifications 타입에 'admin_notice' 추가
-- 어드민이 사용자에게 직접 메시지 보낼 때 사용 (예: 죽은 링크 안내)
-- ──────────────────────────────────────────────

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('community_comment','apt_comment','apt_evicted','feedback_reply','admin_notice'));
