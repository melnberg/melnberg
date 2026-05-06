-- ──────────────────────────────────────────────
-- 118: 출퇴근 인사 보너스 + 게시글 농사 시스템
-- 1) 출퇴근 인사 — 평일/주말 무관, KST 07:00~08:59 또는 18:00~19:59 안에서
--    커뮤니티 글 작성 시 본인 업로드 사진 첨부 → +20 mlbg + posts.is_greeting=true
-- 2) 인사 글 댓글 가중치 — 부모 is_greeting 글에 시간대 안 댓글 → 0.5 → 1.5 (×3)
-- 3) 게시글 농사 — 댓글 1개 달릴 때마다 글 작성자에게 보너스
--    · 커뮤니티: 0.5 mlbg
--    · 핫딜:    2 mlbg
--    1인당 1게시물 1회 (같은 사람이 같은 글에 여러 댓글 달아도 보너스 1회)
-- 4) 핫딜 댓글 보상 강화 — 0.5 → 1 (서버 코드 변경)
-- ──────────────────────────────────────────────

-- 출퇴근 인사 마킹용
alter table public.posts
  add column if not exists is_greeting boolean not null default false;

create index if not exists posts_greeting_idx
  on public.posts(category, created_at desc)
  where is_greeting = true;

comment on column public.posts.is_greeting is
  '출퇴근 인사 보너스 글 (community + KST 07~09 or 18~20 + 본인 사진 첨부 시 자동 마킹)';

-- 게시글 농사 보너스 추적 — (post_id, commenter_id) UNIQUE 로 1회 보장
create table if not exists public.mlbg_farm_log (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  post_author_id uuid not null references auth.users(id) on delete cascade,
  commenter_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('community', 'hotdeal')),
  earned numeric not null check (earned >= 0),
  created_at timestamptz not null default now(),
  unique (post_id, commenter_id)
);
create index if not exists mlbg_farm_log_post_idx on public.mlbg_farm_log(post_id);
create index if not exists mlbg_farm_log_author_idx on public.mlbg_farm_log(post_author_id, created_at desc);

alter table public.mlbg_farm_log enable row level security;
drop policy if exists "mlbg_farm_log readable by participant" on public.mlbg_farm_log;
create policy "mlbg_farm_log readable by participant"
  on public.mlbg_farm_log for select
  using (auth.uid() = post_author_id or auth.uid() = commenter_id);
-- INSERT 는 service_role 만 (award API 가 수행)

notify pgrst, 'reload schema';
