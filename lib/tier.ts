import { createClient } from './supabase/server';
import { getCurrentUser, getCurrentProfile as getCurrentProfileCached } from './auth';
import {
  type Tier,
  type ProfileWithTier,
  type PaymentRecord,
  currentQuarter,
  tierLabelKo,
  isActivePaid,
  formatExpiry,
} from './tier-utils';

export type { Tier, ProfileWithTier, PaymentRecord };
export { currentQuarter, tierLabelKo, isActivePaid, formatExpiry };

// lib/auth.ts 의 cached 헬퍼 재사용 (요청 내 dedup)
export const getCurrentProfile = getCurrentProfileCached;

export async function listOwnPayments(): Promise<PaymentRecord[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', user.id)
    .order('paid_at', { ascending: false });
  return (data ?? []) as PaymentRecord[];
}
