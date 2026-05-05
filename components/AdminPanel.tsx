'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { products } from '@/lib/products';
import { type ProfileWithTier, type PaymentRecord, currentQuarter, formatExpiry, isActivePaid, paymentStatusLabel, tierLabelKo } from '@/lib/tier-utils';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProductId, setBulkProductId] = useState<string>(products[0]?.id ?? '');
  const [bulkPeriod, setBulkPeriod] = useState<'current' | 'next'>('current');
  const [bulkBusy, setBulkBusy] = useState(false);
  // SNS 링크 검사 결과: userId → 'ok' | 'dead' | 'checking'
  const [linkStatus, setLinkStatus] = useState<Map<string, 'ok' | 'dead' | 'checking'>>(new Map());
  const [checkingLinks, setCheckingLinks] = useState(false);

  async function checkAllLinks() {
    if (checkingLinks) return;
    const targets = profiles.filter((p) => !!p.link_url).map((p) => ({ id: p.id, url: p.link_url as string }));
    if (targets.length === 0) { alert('SNS 링크 등록된 회원이 없습니다.'); return; }
    if (!confirm(`SNS 링크 ${targets.length}건 검사 시작 (1~2분). 진행할까요?`)) return;
    setCheckingLinks(true);
    const next = new Map<string, 'ok' | 'dead' | 'checking'>();
    for (const t of targets) next.set(t.id, 'checking');
    setLinkStatus(next);
    try {
      const res = await fetch('/api/admin/check-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json?.error ?? '검사 실패'); setCheckingLinks(false); return; }
      const map = new Map<string, 'ok' | 'dead' | 'checking'>();
      for (const r of (json.results ?? []) as Array<{ id: string; status: 'ok' | 'dead' }>) {
        map.set(r.id, r.status);
      }
      setLinkStatus(map);
    } catch (e) {
      alert(e instanceof Error ? e.message : '검사 실패');
    }
    setCheckingLinks(false);
  }

  async function clearLink(profile: ProfileWithTier) {
    if (!confirm(`${profile.display_name ?? profile.id.slice(0, 8)} 의 SNS 링크를 삭제할까요?`)) return;
    const { error } = await supabase.from('profiles').update({ link_url: null }).eq('id', profile.id);
    if (error) { alert(error.message); return; }
    setProfiles((prev) => prev.map((p) => p.id === profile.id ? { ...p, link_url: null } : p));
    setLinkStatus((prev) => { const n = new Map(prev); n.delete(profile.id); return n; });
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return profiles;
    const q = search.toLowerCase();
    return profiles.filter(
      (p) =>
        (p.display_name ?? '').toLowerCase().includes(q)
        || (p.naver_id ?? '').toLowerCase().includes(q)
        || p.id.toLowerCase().includes(q),
    );
  }, [profiles, search]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(visible: ProfileWithTier[]) {
    setSelectedIds((prev) => {
      const allSelected = visible.every((p) => prev.has(p.id));
      const next = new Set(prev);
      if (allSelected) {
        for (const p of visible) next.delete(p.id);
      } else {
        for (const p of visible) next.add(p.id);
      }
      return next;
    });
  }

  async function bulkUpgrade() {
    if (selectedIds.size === 0 || bulkBusy) return;
    if (!confirm(`선택된 ${selectedIds.size}명을 조합원으로 등업합니다.`)) return;
    setBulkBusy(true);
    const q = bulkPeriod === 'current' ? currentQuarter() : nextQuarter();
    for (const id of selectedIds) {
      const profile = profiles.find((p) => p.id === id);
      if (!profile) continue;
      await setTier(profile, { tier: 'paid', expiresAt: q.endsAt, productId: bulkProductId, periodLabel: q.label });
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
  }

  async function bulkDowngrade() {
    if (selectedIds.size === 0 || bulkBusy) return;
    if (!confirm(`선택된 ${selectedIds.size}명을 무료회원으로 전환합니다.`)) return;
    setBulkBusy(true);
    for (const id of selectedIds) {
      const profile = profiles.find((p) => p.id === id);
      if (!profile) continue;
      await setTier(profile, { tier: 'free', expiresAt: null });
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    if (selectedIds.size === 0 || bulkBusy) return;
    if (!confirm(`선택된 ${selectedIds.size}명을 강제탈퇴 시킵니다.\n\n되돌릴 수 없습니다 (계정·글·댓글·점거 모두 삭제).`)) return;
    if (!confirm(`마지막 확인. ${selectedIds.size}명 강제탈퇴 진행?`)) return;
    setBulkBusy(true);
    for (const id of selectedIds) {
      const profile = profiles.find((p) => p.id === id);
      if (!profile) continue;
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: id }),
      });
      if (res.ok) setProfiles((prev) => prev.filter((p) => p.id !== id));
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    router.refresh();
  }

  async function deleteUser(profile: ProfileWithTier) {
    const name = profile.display_name ?? profile.id.slice(0, 8);
    if (!confirm(`정말로 "${name}" 회원을 강제 탈퇴시키겠습니까?\n\n이 작업은 되돌릴 수 없습니다 — 계정·작성글·댓글·점거 정보가 모두 삭제됩니다.`)) return;
    if (!confirm(`마지막 확인. "${name}" 강제탈퇴 진행?`)) return;
    setBusyId(`delete-${profile.id}`);
    const res = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: profile.id }),
    });
    setBusyId(null);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      alert(`삭제 실패: ${error ?? res.status}`);
      return;
    }
    setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    router.refresh();
  }

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

  async function approvePayment(payment: PaymentRecord, period: 'current' | 'next') {
    if (busyId) return;
    const product = products.find((p) => p.id === payment.product_id);
    const grantsTier = product?.id === 'new-membership' || product?.id === 'renewal';
    setBusyId(`approve-${payment.id}`);

    const q = period === 'current' ? currentQuarter() : nextQuarter();
    const expiresAt = grantsTier ? q.endsAt : null;

    // 1. 결제 기록 paid로 전환 + 등급 정보 기록
    const { error: payErr } = await supabase
      .from('payments')
      .update({
        status: 'paid',
        tier_granted: grantsTier ? 'paid' : null,
        tier_period_label: grantsTier ? q.label : null,
        tier_expires_at: expiresAt ? expiresAt.toISOString() : null,
        paid_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    if (payErr) {
      alert(payErr.message);
      setBusyId(null);
      return;
    }

    // 2. 멤버십 상품인 경우 회원 등급도 갱신
    if (grantsTier && expiresAt) {
      const target = profiles.find((p) => p.id === payment.user_id);
      const currentExpiry = target?.tier_expires_at ? new Date(target.tier_expires_at) : null;
      const newExpiry = currentExpiry && currentExpiry > expiresAt ? currentExpiry : expiresAt;

      const { error: profErr } = await supabase
        .from('profiles')
        .update({ tier: 'paid', tier_expires_at: newExpiry.toISOString() })
        .eq('id', payment.user_id);

      if (profErr) {
        alert(profErr.message);
        setBusyId(null);
        return;
      }

      setProfiles(profiles.map((p) =>
        p.id === payment.user_id ? { ...p, tier: 'paid', tier_expires_at: newExpiry.toISOString() } : p,
      ));
    }

    setPayments(payments.map((p) =>
      p.id === payment.id
        ? {
            ...p,
            status: 'paid',
            tier_granted: grantsTier ? 'paid' : null,
            tier_period_label: grantsTier ? q.label : null,
            tier_expires_at: expiresAt ? expiresAt.toISOString() : null,
          }
        : p,
    ));
    setBusyId(null);
    router.refresh();
  }

  async function rejectPayment(payment: PaymentRecord) {
    if (busyId) return;
    if (!confirm('이 결제 신청을 반려(취소)하시겠습니까? 회원 등급은 변경되지 않습니다.')) return;
    setBusyId(`reject-${payment.id}`);
    const { error } = await supabase
      .from('payments')
      .update({ status: 'cancelled' })
      .eq('id', payment.id);
    if (error) {
      alert(error.message);
      setBusyId(null);
      return;
    }
    setPayments(payments.map((p) => (p.id === payment.id ? { ...p, status: 'cancelled' } : p)));
    setBusyId(null);
    router.refresh();
  }

  const pendingPayments = payments.filter((p) => p.status === 'pending' || p.status === 'submitted');

  return (
    <div className="flex flex-col gap-12">
      {/* 결제 신청 (승인 대기) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[18px] font-bold text-navy">
            결제 승인 대기
            {pendingPayments.length > 0 && (
              <span className="ml-2 inline-block bg-cyan text-navy text-[11px] font-bold tracking-widest uppercase px-2 py-0.5">
                {pendingPayments.length}
              </span>
            )}
          </h2>
        </div>

        {pendingPayments.length === 0 ? (
          <p className="text-[13px] text-muted py-6 px-5 border border-border text-center">승인 대기 중인 결제가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-bg/60 border-y border-navy text-muted">
                  <th className="py-2 px-2 font-semibold text-left">상품 / 회원</th>
                  <th className="py-2 px-2 font-semibold text-center w-24">금액</th>
                  <th className="py-2 px-2 font-semibold text-center w-24">PG</th>
                  <th className="py-2 px-2 font-semibold text-center w-28">입금자명</th>
                  <th className="py-2 px-2 font-semibold text-center w-32">신청일</th>
                  <th className="py-2 px-2 font-semibold text-center w-20">상태</th>
                  <th className="py-2 px-2 font-semibold text-left">처리</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayments.map((p) => {
                  const profile = profiles.find((pp) => pp.id === p.user_id);
                  const isMembership = p.product_id === 'new-membership' || p.product_id === 'renewal';
                  return (
                    <tr key={p.id} className="border-b border-border align-top hover:bg-bg/40">
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-text">{p.product_name}</div>
                        <div className="text-[11px] text-muted mt-0.5">{profile?.display_name ?? '(알 수 없음)'}</div>
                      </td>
                      <td className="py-2.5 px-2 text-center tabular-nums">{p.amount.toLocaleString('ko-KR')}원</td>
                      <td className="py-2.5 px-2 text-center text-muted">{p.pg_provider ?? '-'}</td>
                      <td className="py-2.5 px-2 text-center">{p.payer_name ?? <span className="text-muted">-</span>}</td>
                      <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                        {new Date(p.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`text-[10px] font-bold tracking-widest uppercase ${p.status === 'submitted' ? 'text-cyan' : 'text-muted'}`}>
                          {paymentStatusLabel(p.status)}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <ApproveActions
                          payment={p}
                          isMembership={isMembership}
                          onApprove={approvePayment}
                          onReject={rejectPayment}
                          busy={busyId === `approve-${p.id}` || busyId === `reject-${p.id}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 회원 목록 */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-[18px] font-bold text-navy">회원 ({profiles.length}명)</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="닉네임/ID 검색"
            className="border border-border border-b-2 border-b-navy px-3 py-1.5 text-[13px] outline-none focus:border-b-cyan rounded-none w-64"
          />
        </div>

        {/* 일괄 작업 toolbar */}
        <div className="border border-border bg-navy-soft px-4 py-3 mb-2 flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-navy mr-2">선택: {selectedIds.size}명</span>
          <select
            value={bulkProductId}
            onChange={(e) => setBulkProductId(e.target.value)}
            disabled={bulkBusy}
            className="border border-border px-2 py-1 text-[12px] outline-none focus:border-navy rounded-none"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={bulkPeriod}
            onChange={(e) => setBulkPeriod(e.target.value as 'current' | 'next')}
            disabled={bulkBusy}
            className="border border-border px-2 py-1 text-[12px] outline-none focus:border-navy rounded-none"
          >
            <option value="current">현분기</option>
            <option value="next">다음분기</option>
          </select>
          <button
            type="button"
            onClick={bulkUpgrade}
            disabled={bulkBusy || selectedIds.size === 0}
            className="bg-navy text-white px-3 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-30 disabled:cursor-not-allowed border-none"
          >
            조합원 등업
          </button>
          <button
            type="button"
            onClick={bulkDowngrade}
            disabled={bulkBusy || selectedIds.size === 0}
            className="bg-white border border-border text-text px-3 py-1.5 text-[12px] font-semibold tracking-wide cursor-pointer hover:border-navy hover:text-navy disabled:opacity-30 disabled:cursor-not-allowed"
          >
            무료 전환
          </button>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkBusy || selectedIds.size === 0}
            className="ml-auto bg-white border border-red-500 text-red-600 px-3 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            강제탈퇴
          </button>
          <button
            type="button"
            onClick={checkAllLinks}
            disabled={checkingLinks}
            className="bg-white border border-navy text-navy px-3 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy hover:text-white disabled:opacity-40"
            title="등록된 모든 SNS 링크를 서버에서 fetch 해서 깨진 링크 표시"
          >
            {checkingLinks ? 'SNS 검사중...' : 'SNS 링크 일괄 검사'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-bg/60 border-y border-navy text-muted">
                <th className="py-2 px-2 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id))}
                    onChange={() => toggleSelectAll(filtered)}
                    className="w-4 h-4 accent-navy cursor-pointer"
                  />
                </th>
                <th className="py-2 px-2 font-semibold text-left">닉네임</th>
                <th className="py-2 px-2 font-semibold text-left w-32">네이버 ID</th>
                <th className="py-2 px-2 font-semibold text-left w-48">이메일</th>
                <th className="py-2 px-2 font-semibold text-left w-[280px]">SNS 링크</th>
                <th className="py-2 px-2 font-semibold text-center w-20">등급</th>
                <th className="py-2 px-2 font-semibold text-center w-28">만료일</th>
                <th className="py-2 px-2 font-semibold text-center w-24">가입일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isActive = isActivePaid(p);
                const checked = selectedIds.has(p.id);
                return (
                  <tr key={p.id} className={`border-b border-border hover:bg-bg/40 ${checked ? 'bg-[#f5f9ff]' : ''}`}>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(p.id)}
                        className="w-4 h-4 accent-navy cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="font-bold text-text" title={p.id}>
                        {p.display_name ?? '(이름 없음)'}
                        {p.is_admin && <span className="ml-2 text-[10px] font-bold text-cyan tracking-widest uppercase">admin</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-[12px] text-text">
                      {p.naver_id ?? <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2.5 px-2 text-[12px] text-text truncate max-w-[200px]" title={(p as { email?: string | null }).email ?? ''}>
                      {(p as { email?: string | null }).email ?? <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2.5 px-2 text-[11px]">
                      {p.link_url ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          {(() => {
                            const st = linkStatus.get(p.id);
                            if (st === 'checking') return <span className="text-[10px] text-muted">●</span>;
                            if (st === 'dead') return <span className="text-[10px] text-red-600" title="404·접속불가">●</span>;
                            if (st === 'ok') return <span className="text-[10px] text-green-600" title="정상">●</span>;
                            return <span className="text-[10px] text-muted/30">○</span>;
                          })()}
                          <a
                            href={p.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-navy hover:underline truncate min-w-0 flex-1"
                            title={p.link_url}
                          >
                            {p.link_url.replace(/^https?:\/\//, '').replace(/^www\./, '')}
                          </a>
                          {linkStatus.get(p.id) === 'dead' && (
                            <button
                              type="button"
                              onClick={() => clearLink(p)}
                              className="text-[10px] font-bold text-red-600 hover:text-red-800 bg-transparent border-none p-0 flex-shrink-0"
                              title="이 링크 삭제 (link_url = null)"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-block text-[10px] font-bold tracking-widest uppercase px-2 py-1 ${isActive ? 'bg-cyan text-navy' : 'bg-navy-soft text-navy'}`}>
                        {isActive ? '조합원' : tierLabelKo(p.tier)}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                      {formatExpiry(p.tier_expires_at)}
                    </td>
                    <td className="py-2.5 px-2 text-center text-muted tabular-nums">
                      {new Date(p.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted">검색 결과가 없습니다.</td>
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
                          {paymentStatusLabel(p.status)}
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

function ApproveActions({
  payment,
  isMembership,
  onApprove,
  onReject,
  busy,
}: {
  payment: PaymentRecord;
  isMembership: boolean;
  onApprove: (payment: PaymentRecord, period: 'current' | 'next') => Promise<void>;
  onReject: (payment: PaymentRecord) => Promise<void>;
  busy: boolean;
}) {
  const [period, setPeriod] = useState<'current' | 'next'>('current');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isMembership && (
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as 'current' | 'next')}
          disabled={busy}
          className="border border-border px-2 py-1 text-[11px] outline-none focus:border-navy rounded-none"
        >
          <option value="current">현분기</option>
          <option value="next">다음분기</option>
        </select>
      )}
      <button
        type="button"
        onClick={() => onApprove(payment, period)}
        disabled={busy}
        className="bg-navy text-white px-3 py-1 text-[11px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-50 border-none"
      >
        {busy ? '...' : '승인'}
      </button>
      <button
        type="button"
        onClick={() => onReject(payment)}
        disabled={busy}
        className="bg-white border border-border text-text px-3 py-1 text-[11px] font-semibold tracking-wide cursor-pointer hover:border-red-600 hover:text-red-600 disabled:opacity-50"
      >
        반려
      </button>
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
        {busy ? '...' : '조합원 등업'}
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
