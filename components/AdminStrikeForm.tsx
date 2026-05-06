'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { notifyTelegram } from '@/lib/telegram-notify';
import { revalidateHome } from '@/lib/revalidate-home';

type StrikeTarget = {
  asset_type: 'factory' | 'emart';
  asset_id: number;
  asset_name: string;
  brand_label: string;
  occupier_id: string;
  occupier_name: string | null;
  occupier_balance: number;
  default_pct: number;
};

// 점거된 비주거용 자산 일괄 파업.
// 다중 선택 + % 입력 → 각 자산에 strike_asset RPC 순차 호출 → 알림 + revalidateHome.
export default function AdminStrikeForm({ targets }: { targets: StrikeTarget[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pctInput, setPctInput] = useState('10');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; pct?: number; loss?: number; err?: string }>>([]);

  // 브랜드별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, StrikeTarget[]>();
    for (const t of targets) {
      const key = t.brand_label;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [targets]);

  function keyOf(t: StrikeTarget): string { return `${t.asset_type}:${t.asset_id}`; }
  function toggle(t: StrikeTarget) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(t);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function selectBrand(brand: string, all: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const list = grouped.find(([b]) => b === brand)?.[1] ?? [];
      for (const t of list) {
        const k = keyOf(t);
        if (all) next.add(k); else next.delete(k);
      }
      return next;
    });
  }
  function selectAll(all: boolean) {
    setSelected(all ? new Set(targets.map(keyOf)) : new Set());
  }

  async function handleSubmit() {
    if (busy) return;
    if (selected.size === 0) { alert('자산을 1개 이상 선택해주세요'); return; }
    const pct = pctInput.trim() === '' ? null : Number(pctInput);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) { alert('0~100 사이 숫자 또는 빈 값 (자산별 기본값)'); return; }
    if (!confirm(`${selected.size}개 자산에 ${pct === null ? '각 자산 기본 %' : pct + '%'} 파업 적용?`)) return;

    setBusy(true);
    setResults([]);
    const out: typeof results = [];
    for (const t of targets) {
      if (!selected.has(keyOf(t))) continue;
      const { data, error } = await supabase.rpc('strike_asset', {
        p_asset_type: t.asset_type,
        p_asset_id: t.asset_id,
        p_pct: pct,
      });
      const label = `[${t.brand_label}] ${t.asset_name} (${t.occupier_name ?? '점거자'})`;
      if (error) { out.push({ name: label, err: error.message }); continue; }
      const row = (Array.isArray(data) ? data[0] : data) as { out_success: boolean; out_loss_pct: number; out_loss_mlbg: number; out_event_id: number | null; out_message: string | null } | undefined;
      if (!row?.out_success) { out.push({ name: label, err: row?.out_message ?? '실패' }); continue; }
      out.push({ name: label, pct: Number(row.out_loss_pct), loss: Number(row.out_loss_mlbg) });
      if (row.out_event_id) notifyTelegram('strike', row.out_event_id);
    }
    setResults(out);
    setBusy(false);
    setSelected(new Set());
    revalidateHome();
    router.refresh();
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-6">
      {/* 컨트롤 바 */}
      <div className="flex items-end gap-3 flex-wrap border border-border bg-bg/30 px-5 py-4 sticky top-0 z-10">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold tracking-widest uppercase text-muted">차감 %</label>
          <input
            type="number"
            value={pctInput}
            onChange={(e) => setPctInput(e.target.value)}
            min={0}
            max={100}
            placeholder="기본값"
            className="w-[100px] px-3 py-2 border border-border focus:border-navy text-[13px] tabular-nums outline-none rounded-none"
          />
        </div>
        <div className="text-[12px] text-muted">
          빈 값 = 자산별 기본 %
        </div>
        <div className="flex-1" />
        <div className="flex gap-2 items-center">
          <button type="button" onClick={() => selectAll(true)} className="text-[11px] font-bold text-navy hover:text-navy-dark cursor-pointer bg-transparent border border-border hover:border-navy px-2 py-1">전체 선택</button>
          <button type="button" onClick={() => selectAll(false)} className="text-[11px] font-bold text-muted hover:text-text cursor-pointer bg-transparent border border-border hover:border-text px-2 py-1">전체 해제</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || selectedCount === 0}
            className="bg-[#dc2626] text-white px-5 py-2 text-[13px] font-bold tracking-wide cursor-pointer hover:bg-[#b91c1c] disabled:opacity-40 disabled:cursor-not-allowed border-none"
          >
            {busy ? '집행중...' : `💥 파업 (${selectedCount}개)`}
          </button>
        </div>
      </div>

      {/* 브랜드별 자산 목록 */}
      {grouped.map(([brand, list]) => {
        const brandSelectedCount = list.filter((t) => selected.has(keyOf(t))).length;
        return (
          <div key={brand} className="border border-border">
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-bg/40 border-b border-border">
              <div className="text-[13px] font-bold text-navy">{brand} <span className="text-muted font-normal">({list.length})</span></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => selectBrand(brand, true)} className="text-[10px] text-navy hover:text-navy-dark cursor-pointer bg-transparent border-none">{brand} 전체</button>
                <button type="button" onClick={() => selectBrand(brand, false)} className="text-[10px] text-muted hover:text-text cursor-pointer bg-transparent border-none">해제</button>
                {brandSelectedCount > 0 && <span className="text-[10px] text-cyan font-bold">{brandSelectedCount} 선택됨</span>}
              </div>
            </div>
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="py-1.5 px-2 font-semibold w-10"></th>
                  <th className="py-1.5 px-2 font-semibold text-left">자산</th>
                  <th className="py-1.5 px-2 font-semibold text-left w-32">점거자</th>
                  <th className="py-1.5 px-2 font-semibold text-right w-28">잔액 mlbg</th>
                  <th className="py-1.5 px-2 font-semibold text-right w-20">기본 %</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => {
                  const k = keyOf(t);
                  const isSel = selected.has(k);
                  return (
                    <tr key={k} className={`border-b border-border cursor-pointer ${isSel ? 'bg-[#fef2f2]' : 'hover:bg-bg/40'}`} onClick={() => toggle(t)}>
                      <td className="py-1.5 px-2 text-center">
                        <input type="checkbox" checked={isSel} onChange={() => toggle(t)} onClick={(e) => e.stopPropagation()} className="cursor-pointer" />
                      </td>
                      <td className="py-1.5 px-2 truncate">{t.asset_name}</td>
                      <td className="py-1.5 px-2 truncate text-navy font-bold">{t.occupier_name ?? '익명'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{Number(t.occupier_balance).toLocaleString()}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-muted">{Number(t.default_pct)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* 실행 결과 */}
      {results.length > 0 && (
        <div className="border-2 border-[#dc2626] bg-[#fef2f2] px-5 py-4">
          <div className="text-[13px] font-bold text-[#dc2626] mb-2">집행 결과 ({results.length}건)</div>
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={i} className="text-[12px]">
                {r.err
                  ? <span className="text-red-700">❌ {r.name} — {r.err}</span>
                  : <span className="text-text">✅ {r.name} — <b>{r.pct}%</b> ({Number(r.loss).toLocaleString()} mlbg) 차감</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
