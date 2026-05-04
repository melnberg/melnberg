-- ──────────────────────────────────────────────
-- 044: 토스페이먼츠 v2 결제위젯 연동
-- payments 테이블에 토스 필드 + 'pending' 상태 허용
-- ──────────────────────────────────────────────

alter table public.payments
  add column if not exists toss_order_id text,
  add column if not exists toss_payment_key text,
  add column if not exists toss_method text,            -- '카드', '간편결제', '계좌이체' 등
  add column if not exists toss_raw jsonb;              -- 토스 응답 원본 (디버깅·환불용)

-- toss_order_id 는 토스가 멱등 키로 사용. unique 권장
create unique index if not exists payments_toss_order_id_unique
  on public.payments(toss_order_id) where toss_order_id is not null;

-- 사용자 본인이 결제 시작 시 pending 행을 미리 INSERT 하므로 INSERT 정책 추가
drop policy if exists "Users can insert own pending payment" on public.payments;
create policy "Users can insert own pending payment"
  on public.payments for insert
  with check (auth.uid() = user_id);

-- 본인이 자기 pending 행을 update 가능 (confirm 흐름)
drop policy if exists "Users can update own pending payment" on public.payments;
create policy "Users can update own pending payment"
  on public.payments for update
  using (auth.uid() = user_id);

comment on column public.payments.toss_order_id is '우리가 생성한 주문번호 (토스 orderId). 멱등키.';
comment on column public.payments.toss_payment_key is '토스가 발급한 결제 키 (paymentKey).';
comment on column public.payments.toss_method is '결제 수단 (카드/간편결제/계좌이체 등).';
comment on column public.payments.toss_raw is '토스 confirm 응답 원본 (환불·디버깅용).';
