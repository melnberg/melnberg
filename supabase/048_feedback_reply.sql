-- ──────────────────────────────────────────────
-- 048: 건의사항 답글 + 알림
-- 어드민이 답글 달면 사용자 알림 종에 표시
-- ──────────────────────────────────────────────

alter table public.feedback
  add column if not exists admin_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references auth.users(id) on delete set null;

create index if not exists feedback_user_unread_reply_idx
  on public.feedback(user_id, replied_at desc)
  where replied_at is not null;

-- notifications 타입에 'feedback_reply' 추가
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('community_comment','apt_comment','apt_evicted','feedback_reply'));

-- 본인 피드백 자기 자신은 select 가능 (어드민이 아니어도 자기 피드백 + 답글 볼 수 있게)
drop policy if exists "users read own feedback" on public.feedback;
create policy "users read own feedback"
  on public.feedback for select
  using (user_id = auth.uid());

-- 어드민이 admin_reply 채우는 update 가 가능하도록 (이미 admins update 정책 있음)

-- 트리거: admin_reply 가 null → not null 로 바뀌면 사용자에게 알림 + replied_at 자동 채움
create or replace function public.notify_feedback_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  -- 답글이 처음 달리거나 변경된 경우만 (clear 시 알림 X)
  if new.admin_reply is null or trim(new.admin_reply) = '' then return new; end if;
  if old.admin_reply is not null and old.admin_reply = new.admin_reply then return new; end if;
  if new.user_id is null then return new; end if;       -- 비로그인 사용자 피드백은 알림 불가
  -- replied_at, replied_by 자동 셋
  new.replied_at := now();
  if new.replied_by is null then new.replied_by := auth.uid(); end if;

  select display_name into v_actor_name from public.profiles where id = auth.uid();
  insert into public.notifications(recipient_id, type, actor_id, actor_name, comment_excerpt)
  values (new.user_id, 'feedback_reply', auth.uid(), v_actor_name, left(new.admin_reply, 80));
  return new;
end;
$$;

drop trigger if exists trg_notify_feedback_reply on public.feedback;
create trigger trg_notify_feedback_reply
  before update on public.feedback
  for each row execute function public.notify_feedback_reply();

comment on column public.feedback.admin_reply is '관리자 답글 본문.';
comment on column public.feedback.replied_at is '답글 단 시각 (트리거가 자동 셋).';
comment on column public.feedback.replied_by is '답글 단 관리자 id.';
