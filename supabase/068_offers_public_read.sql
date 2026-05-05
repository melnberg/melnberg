-- ──────────────────────────────────────────────
-- 068: apt_listing_offers RLS 완화 — 모든 호가 공개
-- 호가/내놔 활동을 누구나 볼 수 있도록. 긴장감↑·게임성↑.
-- INSERT/UPDATE/DELETE 는 여전히 RPC 만 (정책 없음).
-- ──────────────────────────────────────────────

drop policy if exists "offers readable by participants" on public.apt_listing_offers;
drop policy if exists "offers readable by all" on public.apt_listing_offers;
create policy "offers readable by all"
  on public.apt_listing_offers for select using (true);
