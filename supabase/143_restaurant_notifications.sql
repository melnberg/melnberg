-- ──────────────────────────────────────────────
-- 143: 맛집 핀 댓글 시 등록자에게 알림
-- 1) notifications type check 에 'restaurant_comment' 추가
-- 2) restaurant_pin_comments INSERT 트리거 — 핀 등록자(author_id) 에게 알림 자동 생성
-- ──────────────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'community_comment','apt_comment','apt_evicted','feedback_reply',
    'admin_notice','bio_comment',
    'offer_made','offer_accepted','snatch_made',
    'election_winner','election_loser',
    'restaurant_comment'
  ));

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
  -- 본인이 본인 핀에 댓글 달면 알림 skip
  if v_author = new.author_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.author_id;
  insert into public.notifications(recipient_id, type, comment_id, comment_excerpt, actor_id, actor_name, listing_message)
  values (v_author, 'restaurant_comment', new.id, left(coalesce(new.content, ''), 80), new.author_id, v_actor_name, v_pin_name);
  return new;
end;
$$;

drop trigger if exists trg_notify_restaurant_comment on public.restaurant_pin_comments;
create trigger trg_notify_restaurant_comment
  after insert on public.restaurant_pin_comments
  for each row execute function public.notify_restaurant_comment();

notify pgrst, 'reload schema';
