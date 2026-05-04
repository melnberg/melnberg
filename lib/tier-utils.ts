// 클라이언트·서버 양쪽에서 안전하게 쓸 수 있는 등급 유틸 (next/headers 의존 없음)

export type Tier = 'free' | 'paid';

export type ProfileWithTier = {
  id: string;
  display_name: string | null;
  naver_id: string | null;
  is_admin: boolean;
  tier: Tier;
  tier_expires_at: string | null;
  created_at: string;
};

export type PaymentStatus = 'pending' | 'submitted' | 'paid' | 'refunded' | 'cancelled';

export type PaymentRecord = {
  id: number;
  user_id: string;
  product_id: string;
  product_name: string;
  amount: number;
  pg_provider: string | null;
  pg_payment_id: string | null;
  status: PaymentStatus;
  tier_granted: string | null;
  tier_period_label: string | null;
  tier_expires_at: string | null;
  note: string | null;
  payer_name: string | null;
  paid_at: string;
  created_at: string;
};

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'pending': return '결제대기';
    case 'submitted': return '입금확인중';
    case 'paid': return '결제완료';
    case 'refunded': return '환불';
    case 'cancelled': return '취소';
  }
}

export function currentQuarter(date = new Date()): { label: string; startsAt: Date; endsAt: Date } {
  const year = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3) + 1;
  const startMonth = (q - 1) * 3;
  const startsAt = new Date(year, startMonth, 1, 0, 0, 0);
  const endsAt = new Date(year, startMonth + 3, 1, 0, 0, 0);
  return { label: `${year}Q${q}`, startsAt, endsAt };
}

export function tierLabelKo(tier: Tier): string {
  return tier === 'paid' ? '조합원' : '무료회원';
}

export function isActivePaid(profile: { tier: Tier; tier_expires_at: string | null } | null): boolean {
  if (!profile) return false;
  if (profile.tier !== 'paid') return false;
  if (!profile.tier_expires_at) return true;
  return new Date(profile.tier_expires_at) > new Date();
}

export function formatExpiry(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
