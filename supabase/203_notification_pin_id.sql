-- ──────────────────────────────────────────────
-- 203: 맛집/육아 알림에 pin_id 저장 (notifications.post_id 재활용)
-- 알림 클릭 시 해당 핀 상세 페이지로 라우팅하기 위해 필요.
-- 기존 트리거 4개는 pin_id 를 비워뒀음 — post_id 컬럼에 저장하도록 수정.
-- 백필: comment_id 있는 알림은 댓글 테이블에서 pin_id 역추적. like 알림은 백필 불가 (어차피 곧 사라짐).
-- ──────────────────────────────────────────────

-- 1) restaurant_comment — comment_id + post_id(=pin_id)
create or replace function public.notify_restaurant_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_pin_name text;
  v_actor_name text;
begin
  select author_id, name into v_author, v_pin_name from public.restaurant_pins where id = new.pin_id;
  if v_author is null then return new; end if;
  if v_author = new.author_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.author_id;
  insert into public.notifications(recipient_id, type, post_id, comment_id, comment_excerpt, actor_id, actor_name, listing_message)
  values (v_author, 'restaurant_comment', new.pin_id, new.id, left(coalesce(new.content, ''), 80), new.author_id, v_actor_name, v_pin_name);
  return new;
end;
$$;

-- 2) restaurant_like — post_id(=pin_id)
create or replace function public.notify_restaurant_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_pin_name text;
  v_actor_name text;
begin
  select author_id, name into v_author, v_pin_name from public.restaurant_pins where id = new.pin_id;
  if v_author is null then return new; end if;
  if v_author = new.user_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.user_id;
  insert into public.notifications(recipient_id, type, post_id, actor_id, actor_name, listing_message)
  values (v_author, 'restaurant_like', new.pin_id, new.user_id, v_actor_name, v_pin_name);
  return new;
end;
$$;

-- 3) kids_comment — comment_id + post_id(=pin_id)
create or replace function public.notify_kids_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_pin_name text; v_actor_name text;
begin
  select author_id, name into v_author, v_pin_name from public.kids_pins where id = new.pin_id;
  if v_author is null or v_author = new.author_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.author_id;
  insert into public.notifications(recipient_id, type, post_id, comment_id, comment_excerpt, actor_id, actor_name, listing_message)
  values (v_author, 'kids_comment', new.pin_id, new.id, left(coalesce(new.content, ''), 80), new.author_id, v_actor_name, v_pin_name);
  return new;
end;
$$;

-- 4) kids_like — post_id(=pin_id)
create or replace function public.notify_kids_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_pin_name text; v_actor_name text;
begin
  select author_id, name into v_author, v_pin_name from public.kids_pins where id = new.pin_id;
  if v_author is null or v_author = new.user_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.user_id;
  insert into public.notifications(recipient_id, type, post_id, actor_id, actor_name, listing_message)
  values (v_author, 'kids_like', new.pin_id, new.user_id, v_actor_name, v_pin_name);
  return new;
end;
$$;

-- 5) 기존 알림 백필 — comment_id 있는 것만 가능
update public.notifications n
   set post_id = c.pin_id
  from public.restaurant_pin_comments c
 where n.type = 'restaurant_comment'
   and n.post_id is null
   and n.comment_id = c.id;

update public.notifications n
   set post_id = c.pin_id
  from public.kids_pin_comments c
 where n.type = 'kids_comment'
   and n.post_id is null
   and n.comment_id = c.id;

notify pgrst, 'reload schema';
