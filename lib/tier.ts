import { createClient } from './supabase/server';
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

export async function getCurrentProfile(): Promise<ProfileWithTier | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, tier, tier_expires_at, created_at')
    .eq('id', user.id)
    .maybeSingle();
  return data as ProfileWithTier | null;
}

export async function listOwnPayments(): Promise<PaymentRecord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', user.id)
    .order('paid_at', { ascending: false });
  return (data ?? []) as PaymentRecord[];
}
