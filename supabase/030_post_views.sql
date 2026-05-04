-- ──────────────────────────────────────────────
-- 030: 커뮤니티 글 조회수
-- posts.view_count 컬럼 + 증가 RPC (RLS 우회 + race-free)
-- ──────────────────────────────────────────────

alter table public.posts
  add column if not exists view_count int not null default 0;

-- 조회수 증가 RPC — 누구나 호출 가능 (조회는 누구나 가능하므로)
create or replace function public.increment_post_view(p_post_id bigint)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.posts
    set view_count = view_count + 1
    where id = p_post_id
    returning view_count into v_count;
  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.increment_post_view(bigint) to anon, authenticated;

comment on function public.increment_post_view is '커뮤니티 글 조회수 +1. RLS 우회. 같은 세션 중복 호출 막는 건 클라이언트 책임.';
