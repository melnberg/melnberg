'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Tier = { pct: number; amount: number };
type PreviewRow = { tier_idx: number; pct_from: number; pct_to: number; amount: number; recipients: number; subtotal: number };

const DEFAULT_TIERS: Tier[] = [
  { pct: 50, amount: 30 },
  { pct: 80, amount: 15 },
  { pct: 100, amount: 5 },
];

export default function BasicIncomeForm() {
  const router = useRouter();
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [title, setTitle] = useState('💸 기본소득 지급 안내');
  const [body, setBody] = useState('');
  const [sendTelegram, setSendTelegram] = useState(true);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setTier(idx: number, key: 'pct' | 'amount', value: number) {
    setTiers((cur) => cur.map((t, i) => (i === idx ? { ...t, [key]: value } : t)));
  }
  function addTier() {
    setTiers((cur) => [...cur, { pct: 100, amount: 0 }]);
  }
  function removeTier(idx: number) {
    setTiers((cur) => cur.filter((_, i) => i !== idx));
  }

  function validate(): string | null {
    if (tiers.length === 0) return '구간 1개 이상 필요';
    let lastPct = 0;
    for (const t of tiers) {
      if (!Number.isFinite(t.pct) || t.pct <= lastPct || t.pct > 100) {
        return `pct 는 오름차순·0보다 크고 100 이하여야 함 (현재 ${t.pct})`;
      }
      if (!Number.isFinite(t.amount) || t.amount < 0) return `amount 는 0 이상 (현재 ${t.amount})`;
      lastPct = t.pct;
    }
    if (lastPct !== 100) return '마지막 구간의 pct 는 100 이어야 함';
    return null;
  }

  async function handlePreview() {
    if (busy) return;
    const err = validate();
    if (err) { setMsg(err); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/basic-income/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(`미리보기 실패: ${j?.error ?? r.status}`); setPreview(null); }
      else setPreview(j.rows ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '실패');
    }
    setBusy(false);
  }

  async function handleDistribute() {
    if (busy) return;
    const err = validate();
    if (err) { setMsg(err); return; }
    if (!title.trim()) { setMsg('공지 제목 필수'); return; }
    const totalRecipients = preview?.reduce((s, r) => s + r.recipients, 0) ?? 0;
    const totalPaid = preview?.reduce((s, r) => s + Number(r.subtotal), 0) ?? 0;
    const confirmMsg = preview
      ? `정말 지급하시겠습니까?\n\n총 ${totalRecipients}명 / ${totalPaid.toLocaleString()} mlbg\n\n같은 날 중복 지급은 차단됩니다.`
      : '미리보기 없이 바로 지급하시겠습니까? (먼저 [미리보기] 권장)';
    if (!confirm(confirmMsg)) return;

    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/basic-income/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiers,
          announcement: { title: title.trim(), body: body.trim() || undefined },
          sendTelegram,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(`❌ 지급 실패: ${j?.error ?? r.status}`); setBusy(false); return; }
      setMsg(`✅ 지급 완료 — 이벤트 #${j.eventId} · ${j.totalRecipients}명 · ${Number(j.totalPaid).toLocaleString()} mlbg · 공지 #${j.announcementId} · 텔레그램 ${j.telegram}`);
      setPreview(null);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '실패');
    }
    setBusy(false);
  }

  return (
    <div className="border border-border bg-white px-5 py-5 flex flex-col gap-5">
      {/* 구간 정의 */}
      <div>
        <div className="text-[14px] font-bold text-navy mb-2">구간 정의 (자산 백분위 오름차순 — 하위→상위)</div>
        <p className="text-[11px] text-muted mb-3">
          pct 는 누적 컷오프. 예) 50 / 80 / 100 → [0~50%, 50~80%, 80~100%]. 마지막 구간은 반드시 100.
        </p>
        <div className="space-y-2">
          {tiers.map((t, i) => {
            const prevPct = i === 0 ? 0 : tiers[i - 1].pct;
            return (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="text-muted tabular-nums w-[120px]">
                  구간 {i + 1}: {prevPct}% ~
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={t.pct}
                  onChange={(e) => setTier(i, 'pct', Number(e.target.value))}
                  className="w-16 px-2 py-1 border border-border focus:border-navy text-[13px] outline-none tabular-nums"
                />
                <span className="text-muted">% →</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={t.amount}
                  onChange={(e) => setTier(i, 'amount', Number(e.target.value))}
                  className="w-20 px-2 py-1 border border-border focus:border-navy text-[13px] outline-none tabular-nums"
                />
                <span className="text-muted">mlbg</span>
                {tiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    className="ml-auto text-[11px] text-red-500 hover:text-red-700 cursor-pointer bg-transparent border-none"
                  >
                    삭제
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addTier}
          className="mt-3 text-[11px] text-cyan hover:text-navy cursor-pointer bg-transparent border border-cyan/40 hover:border-navy px-2 py-1"
        >
          + 구간 추가
        </button>
      </div>

      {/* 공지 */}
      <div>
        <div className="text-[14px] font-bold text-navy mb-2">📣 공지 + 텔레그램</div>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="공지 제목"
            maxLength={200}
            className="px-3 py-2 border border-border focus:border-navy text-[13px] outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="본문 (선택). 텔레그램에도 동일 노출 (280자까지)."
            rows={3}
            maxLength={500}
            className="px-3 py-2 border border-border focus:border-navy text-[13px] outline-none resize-y"
          />
          <label className="flex items-center gap-2 text-[12px] cursor-pointer">
            <input
              type="checkbox"
              checked={sendTelegram}
              onChange={(e) => setSendTelegram(e.target.checked)}
              className="cursor-pointer"
            />
            <span>텔레그램 채널에도 발송</span>
          </label>
        </div>
      </div>

      {/* 미리보기 결과 */}
      {preview && (
        <div className="border border-cyan/40 bg-cyan/5 px-4 py-3">
          <div className="text-[12px] font-bold text-navy mb-2">미리보기 — 실제 지급 X</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left py-1">구간</th>
                <th className="text-right py-1">금액</th>
                <th className="text-right py-1">인원</th>
                <th className="text-right py-1">소계</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.tier_idx} className="border-b border-[#f0f0f0]">
                  <td className="py-1 tabular-nums">{Number(r.pct_from)}% ~ {Number(r.pct_to)}%</td>
                  <td className="text-right tabular-nums">{Number(r.amount).toLocaleString()} mlbg</td>
                  <td className="text-right tabular-nums">{r.recipients} 명</td>
                  <td className="text-right tabular-nums font-bold text-navy">
                    {Number(r.subtotal).toLocaleString()} mlbg
                  </td>
                </tr>
              ))}
              <tr className="font-bold text-navy">
                <td className="pt-2">합계</td>
                <td />
                <td className="text-right pt-2 tabular-nums">
                  {preview.reduce((s, r) => s + r.recipients, 0)} 명
                </td>
                <td className="text-right pt-2 tabular-nums">
                  {preview.reduce((s, r) => s + Number(r.subtotal), 0).toLocaleString()} mlbg
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {msg && (
        <div className={`text-[12px] px-3 py-2 ${msg.startsWith('✅') ? 'bg-cyan/10 text-navy' : 'bg-red-50 text-red-700'}`}>
          {msg}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={busy}
          className="bg-white border border-border text-text px-5 py-2 text-[13px] font-bold cursor-pointer hover:border-navy hover:text-navy disabled:opacity-40"
        >
          {busy ? '...' : '미리보기'}
        </button>
        <button
          type="button"
          onClick={handleDistribute}
          disabled={busy || !title.trim()}
          className="bg-navy text-white px-6 py-2 text-[13px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-40 border-none"
        >
          {busy ? '지급 중...' : '💸 지급하기'}
        </button>
      </div>
    </div>
  );
}
