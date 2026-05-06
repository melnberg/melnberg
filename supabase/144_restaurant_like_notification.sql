-- ──────────────────────────────────────────────
-- 144: 맛집 핀 좋아요 시 등록자에게 알림
-- notifications type check 에 'restaurant_like' 추가
-- restaurant_pin_likes INSERT 트리거 — 등록자(author_id) 에게 알림 자동 생성
-- ──────────────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'community_comment','apt_comment','apt_evicted','feedback_reply',
    'admin_notice','bio_comment',
    'offer_made','offer_accepted','snatch_made',
    'election_winner','election_loser',
    'restaurant_comment','restaurant_like'
  ));

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
  -- 본인이 본인 핀에 좋아요 (RPC 가 막지만 안전망)
  if v_author = new.user_id then return new; end if;
  select display_name into v_actor_name from public.profiles where id = new.user_id;
  insert into public.notifications(recipient_id, type, actor_id, actor_name, listing_message)
  values (v_author, 'restaurant_like', new.user_id, v_actor_name, v_pin_name);
  return new;
end;
$$;

drop trigger if exists trg_notify_restaurant_like on public.restaurant_pin_likes;
create trigger trg_notify_restaurant_like
  after insert on public.restaurant_pin_likes
  for each row execute function public.notify_restaurant_like();

notify pgrst, 'reload schema';
