'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { products } from '@/lib/products';
import { type ProfileWithTier, type PaymentRecord, currentQuarter, formatExpiry, isActivePaid, tierLabelKo } from '@/lib/tier-utils';

type Props = {
  profiles: ProfileWithTier[];
  payments: PaymentRecord[];
};

function nextQuarter(date = new Date()) {
  const cur = currentQuarter(date);
  return currentQuarter(cur.endsAt);
}

export default function AdminPanel({ profiles: initialProfiles, payments: initialPayments }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [payments, setPayments] = useState(initialPayments);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(
      (p) =>
        (p.display_name ?? '').toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [profiles, search]);

  async function setTier(profile: ProfileWithTier, opts: { tier: 'free' | 'paid'; expiresAt: Date | null; productId?: string; periodLabel?: string }) {
    if (busyId) return;
    setBusyId(profile.id);
    const { error } = await supabase
      .from('profiles')
      .update({
        tier: opts.tier,
        tier_expires_at: opts.expiresAt ? opts.expiresAt.toISOString() : null,
      })
      .eq('id', profile.id);

    if (error) {
      alert(error.message);
      setBusyId(null);
      return;
    }

    // 결제 기록도 같이 추가 (paid 등업 시)
    if (opts.tier === 'paid' && opts.productId) {
      const product = products.find((p) => p.id === opts.productId);
      if (product) {
        const { data: paymentData } = await supabase
          .from('payments')
          .insert({
            user_id: profile.id,
            product_id: product.id,
            product_name: product.name,
            amount: product.price,
            pg_provider: 'manual',
            status: 'paid',
            tier_granted: 'paid',
            tier_period_label: opts.periodLabel ?? null,
            tier_expires_at: opts.expiresAt ? opts.expiresAt.toISOString() : null,
            note: '어드민 수동 등업',
          })
          .select('*')
          .single();
        if (paymentData) setPayments([paymentData as PaymentRecord, ...payments]);
      }
    }

    // 로컬 상태 갱신
    setProfiles(profiles.map((p) =>
      p.id === profile.id
        ? { ...p, tier: opts.tier, tier_expires_at: opts.expiresAt ? opts.expiresAt.toISOString() : null }
        : p,
    ));
    setBusyId(null);
    router.refresh();
  }

  async function deletePayment(id: number) {
    if (!confirm('결제 기록을 삭제하시겠습니까? (회원 등급은 변경되지 않음)')) return;
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }
    setPayments(payments.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-12">
      {/* 회원 목록 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[18px] font-bold text-navy">회원 ({profiles.length}명)</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="닉네임/ID 검색"
            className="border border-border border-b-2 border-b-navy px-3 py-1.5 text-[13px] outline-none focus:border-b-cyan rounded-none w-64"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-bg/60 border-y border-navy text-muted">
                <th className="py-2 px-2 font-semibold text-left">닉네임</th>
                <th className="py-2 px-2 font-semibold text-center w-20">등급</th>
                <th className="py-2 px-2 font-semibold text-center w-28">만료일</th>
                <th className="py-2 px-2 font-semibold text-center w-24">가입일</th>
                <th className="py-2 px-2 font-semibold text-left">빠른 작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isActive = isActivePaid(p);
                return (
                  <tr key={p.id} className="border-b border-border align-top hover:bg-bg/40">
                    <td className="py-2.5 px-2">
                      <div className="font-bold text-text">
                        {p.display_name ?? '(이름 없음)'}
                        {p.is_admin && <span className="ml-2 text-[10px] font-bold text-cyan tracking-widest uppercase">admin</span>}
                      </div>
                      <div className="text-[10px] text-muted font-mono mt-0.5 truncate max-w-[280px]">{p.id}</div>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-block text-[10px] font-bold tracking-widest uppercase px-2 py-1 ${isActive ? 'bg-cyan text-navy' : 'bg-navy-soft text-navy'}`}>
                        {isActive ? '정회원' : tierLabelKo(p.tier)}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                      {formatExpiry(p.tier_expires_at)}
                    </td>
                    <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                      {new Date(p.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="py-2.5 px-2">
                      <UpgradeActions profile={p} onUpgrade={setTier} busy={busyId === p.id} />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted">검색 결과가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 결제 내역 */}
      <section>
        <h2 className="text-[18px] font-bold text-navy mb-3">결제 내역 (최근 50건)</h2>

        {payments.length === 0 ? (
          <p className="text-[13px] text-muted py-8 px-5 border border-border text-center">결제 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-bg/60 border-y border-navy text-muted">
                  <th className="py-2 px-2 font-semibold text-left">상품</th>
                  <th className="py-2 px-2 font-semibold text-center w-20">금액</th>
                  <th className="py-2 px-2 font-semibold text-center w-20">PG</th>
                  <th className="py-2 px-2 font-semibold text-center w-24">분기</th>
                  <th className="py-2 px-2 font-semibold text-center w-32">결제일</th>
                  <th className="py-2 px-2 font-semibold text-center w-16">상태</th>
                  <th className="py-2 px-2 font-semibold text-center w-16">관리</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const profile = profiles.find((pp) => pp.id === p.user_id);
                  return (
                    <tr key={p.id} className="border-b border-border hover:bg-bg/40">
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-text">{p.product_name}</div>
                        <div className="text-[11px] text-muted">{profile?.display_name ?? '(알 수 없음)'}</div>
                      </td>
                      <td className="py-2.5 px-2 text-center tabular-nums">{p.amount.toLocaleString('ko-KR')}원</td>
                      <td className="py-2.5 px-2 text-center text-muted">{p.pg_provider ?? '-'}</td>
                      <td className="py-2.5 px-2 text-center text-muted">{p.tier_period_label ?? '-'}</td>
                      <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                        {new Date(p.paid_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`text-[10px] font-bold tracking-widest uppercase ${p.status === 'paid' ? 'text-cyan' : 'text-muted'}`}>
                          {p.status === 'paid' ? '완료' : p.status === 'refunded' ? '환불' : '취소'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => deletePayment(p.id)}
                          className="text-[11px] text-muted hover:text-red-600 cursor-pointer bg-transparent border-none p-0"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function UpgradeActions({
  profile,
  onUpgrade,
  busy,
}: {
  profile: ProfileWithTier;
  onUpgrade: (profile: ProfileWithTier, opts: { tier: 'free' | 'paid'; expiresAt: Date | null; productId?: string; periodLabel?: string }) => Promise<void>;
  busy: boolean;
}) {
  const [productId, setProductId] = useState('new-membership');
  const [period, setPeriod] = useState<'current' | 'next'>('current');

  async function handleUpgrade() {
    const q = period === 'current' ? currentQuarter() : nextQuarter();
    await onUpgrade(profile, {
      tier: 'paid',
      expiresAt: q.endsAt,
      productId,
      periodLabel: q.label,
    });
  }

  async function handleDowngrade() {
    if (!confirm('이 회원을 무료회원으로 전환합니다.')) return;
    await onUpgrade(profile, { tier: 'free', expiresAt: null });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        disabled={busy}
        className="border border-border px-2 py-1 text-[11px] outline-none focus:border-navy rounded-none"
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as 'current' | 'next')}
        disabled={busy}
        className="border border-border px-2 py-1 text-[11px] outline-none focus:border-navy rounded-none"
      >
        <option value="current">현분기</option>
        <option value="next">다음분기</option>
      </select>
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={busy}
        className="bg-navy text-white px-3 py-1 text-[11px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-50 border-none"
      >
        {busy ? '...' : '정회원 등업'}
      </button>
      <button
        type="button"
        onClick={handleDowngrade}
        disabled={busy || profile.tier === 'free'}
        className="bg-white border border-border text-text px-3 py-1 text-[11px] font-semibold tracking-wide cursor-pointer hover:border-navy hover:text-navy disabled:opacity-50"
      >
        무료 전환
      </button>
    </div>
  );
}
