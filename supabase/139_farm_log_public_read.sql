-- ──────────────────────────────────────────────
-- 139: mlbg_farm_log 공개 SELECT — 글 적립 합산 표시 수정
--
-- 사고 (2026-05-06):
--   글 헤더/피드 카드 +N mlbg 표시에 게시글 농사 합산했는데 viewer 가 author/commenter 가 아니면
--   RLS (post_author_id=uid OR commenter_id=uid) 때문에 select 0건 → 합산 안 됨.
--
-- 해결: SELECT 정책 누구나 읽기 가능하게 변경. 데이터는 공개 정보 (글 적립 합산용).
--       INSERT/UPDATE/DELETE 는 그대로 service_role 만 (award API).
-- ──────────────────────────────────────────────

drop policy if exists "mlbg_farm_log readable by participant" on public.mlbg_farm_log;
drop policy if exists "mlbg_farm_log readable by all" on public.mlbg_farm_log;

create policy "mlbg_farm_log readable by all"
  on public.mlbg_farm_log for select
  using (true);

notify pgrst, 'reload schema';
