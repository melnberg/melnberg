'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Member = { naver_id: string; cafe_nickname: string | null; registered_at: string; note: string | null };

export default function CafeMembersAdmin({ initialMembers }: { initialMembers: Member[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [naverId, setNaverId] = useState('');
  const [nickname, setNickname] = useState('');
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [quarter, setQuarter] = useState<string>('all'); // 'all' | '2026Q2' 등

  // 분기 옵션 (실제 데이터에 있는 것만)
  function dateToQuarter(iso: string): string {
    const d = new Date(iso);
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `${y}Q${q}`;
  }
  const quarterOptions = Array.from(new Set(members.map((m) => dateToQuarter(m.registered_at)))).sort().reverse();

  async function refresh() {
    const all: Member[] = [];
    for (let off = 0; off < 50000; off += 1000) {
      const { data } = await supabase
        .from('cafe_paid_members')
        .select('naver_id, cafe_nickname, registered_at, note')
        .order('registered_at', { ascending: false })
        .range(off, off + 999);
      if (!data || data.length === 0) break;
      all.push(...(data as Member[]));
      if (data.length < 1000) break;
    }
    setMembers(all);
  }

  async function addOne() {
    const id = naverId.trim();
    if (!id) { setMsg('네이버 ID를 입력해주세요.'); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('cafe_paid_members').upsert({
      naver_id: id,
      cafe_nickname: nickname.trim() || null,
    }, { onConflict: 'naver_id' });
    setBusy(false);
    if (error) { setMsg(`실패: ${error.message}`); return; }
    setNaverId(''); setNickname('');
    setMsg(`${id} 추가됨.`);
    await refresh();
  }

  async function addBulk() {
    const lines = bulk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { setMsg('데이터를 붙여넣어주세요.'); return; }
    const rows = [];
    for (const line of lines) {
      // 형식: "naver_id,nickname" 또는 "naver_id\tnickname" 또는 그냥 naver_id
      const parts = line.split(/[,\t]/).map((s) => s.trim());
      const id = parts[0];
      const nick = parts[1] || null;
      if (id) rows.push({ naver_id: id, cafe_nickname: nick });
    }
    if (rows.length === 0) { setMsg('유효한 데이터가 없습니다.'); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('cafe_paid_members').upsert(rows, { onConflict: 'naver_id' });
    setBusy(false);
    if (error) { setMsg(`실패: ${error.message}`); return; }
    setBulk('');
    setMsg(`${rows.length}건 추가/갱신됨.`);
    await refresh();
  }

  async function removeOne(id: string) {
    if (!confirm(`'${id}' 삭제할까요? (이미 가입한 회원의 등급은 유지됨)`)) return;
    const { error } = await supabase.from('cafe_paid_members').delete().eq('naver_id', id);
    if (error) { setMsg(`실패: ${error.message}`); return; }
    setMembers((prev) => prev.filter((m) => m.naver_id !== id));
  }

  async function syncTier() {
    if (!confirm('가입한 회원 중 명부 매칭되는 사람을 일괄 정회원 전환합니다. 진행할까요?')) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('sync_cafe_paid_tier');
    setBusy(false);
    if (error) { setMsg(`실패: ${error.message}`); return; }
    setMsg(`${data ?? 0}명 정회원으로 전환됨.`);
    router.refresh();
  }

  const filtered = members.filter((m) => {
    if (quarter !== 'all' && dateToQuarter(m.registered_at) !== quarter) return false;
    if (search && !m.naver_id.includes(search) && !(m.cafe_nickname ?? '').includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      {/* 단일 추가 */}
      <section className="border border-border p-5">
        <h2 className="text-[14px] font-bold text-navy mb-3">단일 추가</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={naverId}
            onChange={(e) => setNaverId(e.target.value)}
            placeholder="네이버 ID"
            className="flex-1 min-w-[180px] border border-border px-3 py-2 text-sm focus:outline-none focus:border-navy"
          />
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="카페 닉네임 (선택)"
            className="flex-1 min-w-[180px] border border-border px-3 py-2 text-sm focus:outline-none focus:border-navy"
          />
          <button
            type="button"
            onClick={addOne}
            disabled={busy}
            className="bg-navy text-white px-4 py-2 text-sm font-bold hover:bg-navy-dark disabled:opacity-50"
          >
            추가
          </button>
        </div>
      </section>

      {/* 일괄 추가 */}
      <section className="border border-border p-5">
        <h2 className="text-[14px] font-bold text-navy mb-2">일괄 추가</h2>
        <p className="text-[12px] text-muted mb-2">
          한 줄에 한 명. 형식: <code className="bg-navy-soft px-1.5 py-0.5">naver_id,닉네임</code> 또는 <code className="bg-navy-soft px-1.5 py-0.5">naver_id</code> 만.
          기존 회원은 닉네임 갱신.
        </p>
        <textarea
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          rows={5}
          placeholder={'예시:\nhameln3,하멜른\nuser123,닉네임1\nuser456'}
          className="w-full border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-navy"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={addBulk}
            disabled={busy}
            className="bg-navy text-white px-4 py-2 text-sm font-bold hover:bg-navy-dark disabled:opacity-50"
          >
            일괄 추가
          </button>
        </div>
      </section>

      {/* sync */}
      <section className="border border-border p-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-navy">기존 가입자 일괄 정회원 전환</h2>
          <p className="text-[12px] text-muted mt-0.5">이미 가입한 회원 중 네이버 ID가 명부와 매칭되는 사람을 paid로 변경.</p>
        </div>
        <button
          type="button"
          onClick={syncTier}
          disabled={busy}
          className="bg-cyan text-white px-4 py-2 text-sm font-bold hover:bg-cyan-dark disabled:opacity-50 flex-shrink-0"
        >
          일괄 동기화
        </button>
      </section>

      {msg && (
        <div className="border border-border bg-navy-soft text-navy text-[13px] px-4 py-2.5">{msg}</div>
      )}

      {/* 목록 */}
      <section className="border border-border">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[14px] font-bold text-navy">전체 명부 ({filtered.length.toLocaleString()}/{members.length.toLocaleString()})</h2>
          <div className="flex items-center gap-2">
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="border border-border px-2.5 py-1.5 text-[12px] bg-white focus:outline-none focus:border-navy"
            >
              <option value="all">전체 분기</option>
              {quarterOptions.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ID·닉네임 검색"
              className="border border-border px-3 py-1.5 text-[12px] w-48 focus:outline-none focus:border-navy"
            />
          </div>
        </div>
        <ul className="divide-y divide-border">
          {filtered.map((m) => (
            <li key={m.naver_id} className="px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-navy">{m.naver_id}</span>
                  {m.cafe_nickname && <span className="text-[12px] text-text">— {m.cafe_nickname}</span>}
                </div>
                <div className="text-[11px] text-muted">{m.registered_at?.slice(0, 10)}</div>
              </div>
              <button
                type="button"
                onClick={() => removeOne(m.naver_id)}
                className="text-[11px] text-muted hover:text-red-600"
              >
                삭제
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-5 py-8 text-center text-[13px] text-muted">결과 없음</li>
          )}
        </ul>
      </section>
    </div>
  );
}
