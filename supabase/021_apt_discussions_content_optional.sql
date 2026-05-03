-- ──────────────────────────────────────────────
-- 021: apt_discussions.content를 선택적(optional)으로 변경
-- 단일 줄 글 허용 — title이 첫 줄, content가 그 이후. 첫 줄만 쓰면 content 빈 값.
-- 실행 위치: Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────

-- not null 제거
alter table public.apt_discussions
  alter column content drop not null;

-- content 관련 inline check 제거 (자동 이름이므로 동적 탐색)
do $$
declare
  cname text;
begin
  for cname in
    select conname from pg_constraint
    where conrelid = 'public.apt_discussions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%content%'
  loop
    execute 'alter table public.apt_discussions drop constraint ' || quote_ident(cname);
  end loop;
end $$;

comment on column public.apt_discussions.content is '본문. 단일 줄 글이면 빈 값 또는 null 가능. title이 첫 줄로 사용됨.';
