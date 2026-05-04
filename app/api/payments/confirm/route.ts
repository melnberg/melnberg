import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { products } from '@/lib/products';
import { currentQuarter } from '@/lib/tier-utils';

export const dynamic = 'force-dynamic';

const TOSS_SECRET = process.env.TOSS_SECRET_KEY ?? '';

function nextQuarter(date = new Date()) {
  const cur = currentQuarter(date);
  return currentQuarter(cur.endsAt);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const paymentKey: string | undefined = body?.paymentKey;
  const orderId: string | undefined = body?.orderId;
  const amount: number | undefined = body?.amount;

  if (!paymentKey || !orderId || !amount) {
    return NextResponse.json({ error: 'paymentKey/orderId/amount 누락' }, { status: 400 });
  }
  if (!TOSS_SECRET) {
    return NextResponse.json({ error: 'TOSS_SECRET_KEY 미설정 (서버)' }, { status: 500 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  // 1) 우리 DB 의 pending 행 조회 + 금액·소유자 검증
  const { data: pending } = await sb
    .from('payments')
    .select('id, user_id, amount, product_id, product_name, status')
    .eq('toss_order_id', orderId)
    .maybeSingle();
  if (!pending) return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
  if (pending.user_id !== user.id) return NextResponse.json({ error: '권한 없음.' }, { status: 403 });
  if (Number(pending.amount) !== Number(amount)) {
    return NextResponse.json({ error: `금액 불일치 (DB ${pending.amount} vs 요청 ${amount}).` }, { status: 400 });
  }
  if (pending.status === 'paid') {
    // 멱등 — 이미 처리됨
    return NextResponse.json({ ok: true, alreadyConfirmed: true, productName: pending.product_name, amount: pending.amount });
  }

  // 2) 토스 confirm 호출
  const auth = Buffer.from(`${TOSS_SECRET}:`).toString('base64');
  const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const tossData = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // 결제 실패 — 우리 DB 도 cancelled 처리
    await sb.from('payments').update({
      status: 'cancelled',
      toss_payment_key: paymentKey,
      toss_raw: tossData,
    }).eq('id', pending.id);
    return NextResponse.json({ error: tossData?.message ?? '토스 confirm 실패', code: tossData?.code }, { status: 502 });
  }

  // 3) 멤버십(분기) 상품이면 등급도 자동 부여
  const product = products.find((p) => p.id === pending.product_id);
  const grantsTier = product?.id === 'new-membership' || product?.id === 'renewal';
  let tierLabel: string | null = null;
  let tierExpires: Date | null = null;
  if (grantsTier) {
    // 분기말까지 유효. 결제일이 분기 마지막 며칠이면 다음분기로 줄지는 운영 정책상 수동 처리.
    const q = currentQuarter();
    tierLabel = q.label;
    tierExpires = q.endsAt;
  }
  void nextQuarter; // 추후 정책 확장용

  // 4) DB 업데이트
  const { error: updErr } = await sb.from('payments').update({
    status: 'paid',
    paid_at: new Date().toISOString(),
    toss_payment_key: paymentKey,
    toss_method: tossData?.method ?? null,
    toss_raw: tossData,
    tier_granted: grantsTier ? 'paid' : null,
    tier_period_label: tierLabel,
    tier_expires_at: tierExpires ? tierExpires.toISOString() : null,
  }).eq('id', pending.id);
  if (updErr) return NextResponse.json({ error: `DB 업데이트 실패: ${updErr.message}` }, { status: 500 });

  if (grantsTier && tierExpires) {
    const { data: prof } = await sb.from('profiles').select('tier_expires_at').eq('id', user.id).maybeSingle();
    const cur = (prof as { tier_expires_at?: string | null } | null)?.tier_expires_at;
    const newExpires = cur && new Date(cur) > tierExpires ? new Date(cur) : tierExpires;
    await sb.from('profiles').update({ tier: 'paid', tier_expires_at: newExpires.toISOString() }).eq('id', user.id);
  }

  return NextResponse.json({
    ok: true,
    productName: pending.product_name,
    amount: pending.amount,
    method: tossData?.method ?? null,
  });
}
