import Link from 'next/link';
import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import LogoutButton from '@/components/LogoutButton';
import NicknameEditor from '@/components/NicknameEditor';
import { createClient } from '@/lib/supabase/server';
import { listOwnPayments, tierLabelKo, isActivePaid, formatExpiry } from '@/lib/tier';
import { paymentStatusLabel } from '@/lib/tier-utils';

export const metadata = { title: '마이페이지 — 멜른버그' };

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/me');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, tier, tier_expires_at, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ??
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split('@')[0] ??
    '회원';

  const tier = (profile?.tier ?? 'free') as 'free' | 'paid';
  const expiresAt = profile?.tier_expires_at ?? null;
  const isActive = isActivePaid({ tier, tier_expires_at: expiresAt });
  const tierBadge = isActive ? '정회원' : tierLabelKo(tier);

  const payments = await listOwnPayments();

  return (
    <Layout>
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { href: '/me', label: '마이페이지', bold: true }]} meta="Account" />

      <section className="py-12">
        <div className="max-w-[680px] mx-auto px-6">
          <h1 className="text-[28px] font-bold text-navy tracking-tight mb-2">마이페이지</h1>
          <p className="text-sm text-muted mb-8">계정 정보를 확인합니다.</p>

          <div className="border border-border">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <span className="text-[12px] font-bold tracking-widest uppercase text-muted">닉네임</span>
              <NicknameEditor initial={displayName} />
            </div>
            <Row label="이메일" value={user.email ?? '-'} />
            <Row label="가입일" value={user.created_at ? new Date(user.created_at).toLocaleDateString('ko-KR') : '-'} />
            <Row label="회원 등급" value={tierBadge} badge tone={isActive ? 'cyan' : 'muted'} />
            {isActive && (
              <Row label="만료일" value={formatExpiry(expiresAt)} />
            )}
          </div>

          {/* 결제 내역 */}
          <div className="mt-10">
            <h2 className="text-[15px] font-bold text-navy mb-3">결제 내역</h2>
            {payments.length === 0 ? (
              <p className="text-[13px] text-muted py-6 px-5 border border-border text-center">
                결제 내역이 없습니다.
              </p>
            ) : (
              <ul className="border border-border">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-text">{p.product_name}</div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {new Date(p.paid_at).toLocaleString('ko-KR')}
                        {p.tier_period_label && ` · ${p.tier_period_label}`}
                        {p.pg_provider && ` · ${p.pg_provider}`}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13px] font-bold tabular-nums">{p.amount.toLocaleString('ko-KR')}원</div>
                      <div className={`text-[10px] font-bold tracking-widest uppercase mt-0.5 ${
                        p.status === 'paid' ? 'text-cyan' : p.status === 'submitted' ? 'text-navy' : 'text-muted'
                      }`}>
                        {paymentStatusLabel(p.status)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-10 flex items-center justify-between">
            {profile?.is_admin && (
              <Link href="/admin" className="text-[13px] font-bold text-navy no-underline hover:underline">
                어드민 페이지 →
              </Link>
            )}
            <div className="ml-auto">
              <LogoutButton />
            </div>
          </div>
        </div>
      </section>

    </Layout>
  );
}

function Row({ label, value, badge, tone }: { label: string; value: string; badge?: boolean; tone?: 'cyan' | 'muted' }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-border last:border-b-0">
      <span className="text-[12px] font-bold tracking-widest uppercase text-muted">{label}</span>
      {badge ? (
        <span
          className={`text-[11px] font-bold tracking-wider uppercase px-3 py-1 ${
            tone === 'cyan' ? 'bg-cyan text-navy' : 'bg-navy-soft text-navy'
          }`}
        >
          {value}
        </span>
      ) : (
        <span className="text-[14px] text-text">{value}</span>
      )}
    </div>
  );
}
