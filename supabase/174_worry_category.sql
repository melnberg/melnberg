-- ──────────────────────────────────────────────
-- 174: 익명 고민상담 게시판 + 하멜른/멜른버그 비방 자동 차단
--
-- posts.category check 확장 — 'worry' 추가
-- comments 테이블도 그대로 사용 (post.category 가 'worry' 면 익명 표시)
--
-- 차단 로직:
--   본문에 [하멜른|멜른버그] 와 부정표현(시발|씨발|개새끼|좆|사기꾼|죽어|꺼져|망해라|fuck 등)
--   둘 다 있으면 INSERT 거부.
--   posts/comments 양쪽에 BEFORE INSERT trigger.
-- ──────────────────────────────────────────────

alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts
  add constraint posts_category_check
  check (category in ('community', 'blog', 'hotdeal', 'stocks', 'realty', 'worry'));

create index if not exists posts_worry_idx
  on public.posts(created_at desc)
  where category = 'worry';

-- 비방 검사 함수 — 본문에 (하멜른|멜른버그) 와 욕설이 동시 등장하면 true
create or replace function public.is_worry_attack(p_text text)
returns boolean
language plpgsql immutable as $$
declare
  v_target text;
begin
  if p_text is null or length(p_text) = 0 then return false; end if;
  -- 띄어쓰기 / 변형 일부 흡수
  v_target := lower(regexp_replace(p_text, '\s+', '', 'g'));
  -- 운영자/플랫폼 관련 키워드
  if v_target !~ '(하멜른|멜른버그|melnberg|hamellen|하멜)' then return false; end if;
  -- 욕설 / 비방 표현
  if v_target ~ '(시발|씨발|시바|씨바|개새끼|개색|좆|존나|죽어라|죽어버려|꺼져라|망해라|사기꾼|사기|쓰레기|병신|븅신|미친놈|미친새|좆까|fuck|shit|bitch|kill|die)' then
    return true;
  end if;
  return false;
end;
$$;

-- posts 트리거 — worry 카테고리만 검사
create or replace function public.posts_worry_block_attack()
returns trigger language plpgsql as $$
begin
  if new.category = 'worry' and (public.is_worry_attack(new.title) or public.is_worry_attack(new.content)) then
    raise exception '비방 표현이 감지되어 등록할 수 없어요.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists posts_worry_block_attack_trg on public.posts;
create trigger posts_worry_block_attack_trg
  before insert or update on public.posts
  for each row execute function public.posts_worry_block_attack();

-- comments 트리거 — worry 카테고리 글에 달리는 댓글만 검사
create or replace function public.comments_worry_block_attack()
returns trigger language plpgsql as $$
declare v_cat text;
begin
  select category into v_cat from public.posts where id = new.post_id;
  if v_cat = 'worry' and public.is_worry_attack(new.content) then
    raise exception '비방 표현이 감지되어 등록할 수 없어요.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists comments_worry_block_attack_trg on public.comments;
create trigger comments_worry_block_attack_trg
  before insert or update on public.comments
  for each row execute function public.comments_worry_block_attack();

notify pgrst, 'reload schema';
