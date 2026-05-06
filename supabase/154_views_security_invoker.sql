-- ──────────────────────────────────────────────
-- 154: 6개 뷰를 SECURITY DEFINER → SECURITY INVOKER 로 전환
-- Supabase Security Advisor 가 경고한 항목 일괄 처리.
--
-- 배경:
--   기본 view 는 만든 사람 (보통 postgres) 권한으로 실행되어, 참조 테이블의 RLS 가 우회됨.
--   security_invoker = true 로 바꾸면 호출자 권한으로 평가 → RLS 정상 작동.
--
-- 위험도:
--   - user_wealth_ranking : 자산 데이터 노출 가능성 (가장 시급)
--   - 나머지 5개 : 부수적 (대체로 공개 데이터지만 권한 명시적으로 좁히는 게 정석)
--
-- PG 15+ 문법 (Supabase 는 15 이상)
-- ──────────────────────────────────────────────

alter view public.user_wealth_ranking set (security_invoker = true);
alter view public.apt_master_visible set (security_invoker = true);
alter view public.apt_master_with_listing set (security_invoker = true);
alter view public.apt_representative_price set (security_invoker = true);
alter view public.apt_discussion_dong_stats set (security_invoker = true);
alter view public.cafe_posts_metadata_stats set (security_invoker = true);

notify pgrst, 'reload schema';
