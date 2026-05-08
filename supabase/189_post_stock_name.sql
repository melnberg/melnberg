-- ──────────────────────────────────────────────
-- 189: posts.stock_name — 종목 태그에 회사명 함께 저장
-- 국장(6자리)·미장(알파벳 ticker) 동일하게 태그 표시를
-- 코드(005930, TSLA) 가 아니라 회사 이름(삼성전자, 테슬라)으로.
-- 기존 글의 stock_code 만 있는 row 는 그대로 두고, 새 글부터 채움.
-- ──────────────────────────────────────────────

alter table public.posts
  add column if not exists stock_name text;

-- 기존 글 백필 — stocks 마스터 (국장 6자리) 에 있으면 회사명 채움
update public.posts p
set stock_name = s.name
from public.stocks s
where p.stock_code = s.code
  and p.stock_name is null
  and p.category = 'stocks';

notify pgrst, 'reload schema';
