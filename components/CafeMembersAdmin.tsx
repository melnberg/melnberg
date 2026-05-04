'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Member = {
  naver_id: string;
  cafe_nickname: string | null;
  registered_at: string;
  note: string | null;
  member_display_name?: string | null;
  member_tier?: string | null;
};

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
    // 프로필 매칭 정보 재조회
    const ids = all.map((m) => m.naver_id);
    const matchMap = new Map<string, { display_name: string | null; tier: string | null }>();
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { data } = await supabase.from('profiles').select('naver_id, display_name, tier').in('naver_id', slice);
      if (data) {
        for (const p of data as Array<{ naver_id: string | null; display_name: string | null; tier: string | null }>) {
          if (p.naver_id) matchMap.set(p.naver_id, { display_name: p.display_name, tier: p.tier });
        }
      }
    }
    setMembers(all.map((m) => {
      const matched = matchMap.get(m.naver_id);
      return { ...m, member_display_name: matched?.display_name ?? null, member_tier: matched?.tier ?? null };
    }));
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

  const [matchFilter, setMatchFilter] = useState<'all' | 'paid' | 'free' | 'nick_mismatch' | 'unsigned'>('all');

  function matchStatus(m: Member): 'paid' | 'free' | 'nick_mismatch' | 'unsigned' {
    if (m.member_display_name == null) return 'unsigned';
    if (m.cafe_nickname && m.member_display_name !== m.cafe_nickname) return 'nick_mismatch';
    if (m.member_tier === 'paid') return 'paid';
    return 'free';
  }

  const filtered = members.filter((m) => {
    if (quarter !== 'all' && dateToQuarter(m.registered_at) !== quarter) return false;
    if (search && !m.naver_id.includes(search) && !(m.cafe_nickname ?? '').includes(search) && !(m.member_display_name ?? '').includes(search)) return false;
    if (matchFilter !== 'all' && matchStatus(m) !== matchFilter) return false;
    return true;
  });

  const counts = {
    paid: members.filter((m) => matchStatus(m) === 'paid').length,
    free: members.filter((m) => matchStatus(m) === 'free').length,
    nick_mismatch: members.filter((m) => matchStatus(m) === 'nick_mismatch').length,
    unsigned: members.filter((m) => matchStatus(m) === 'unsigned').length,
  };

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

      {/* 매칭 상태 요약 */}
      <section className="border border-border p-4 grid grid-cols-4 gap-3 text-center">
        <button type="button" onClick={() => setMatchFilter('paid')} className={`px-2 py-2 ${matchFilter === 'paid' ? 'bg-navy text-white' : 'bg-white hover:bg-navy-soft'}`}>
          <div className="text-[11px] text-muted">정회원 ✓</div>
          <div className="text-[18px] font-bold">{counts.paid.toLocaleString()}</div>
        </button>
        <button type="button" onClick={() => setMatchFilter('free')} className={`px-2 py-2 ${matchFilter === 'free' ? 'bg-navy text-white' : 'bg-white hover:bg-navy-soft'}`}>
          <div className="text-[11px] text-muted">가입O · free</div>
          <div className="text-[18px] font-bold">{counts.free.toLocaleString()}</div>
        </button>
        <button type="button" onClick={() => setMatchFilter('nick_mismatch')} className={`px-2 py-2 ${matchFilter === 'nick_mismatch' ? 'bg-navy text-white' : 'bg-white hover:bg-navy-soft'}`}>
          <div className="text-[11px] text-muted">닉네임 불일치</div>
          <div className="text-[18px] font-bold text-amber-600">{counts.nick_mismatch.toLocaleString()}</div>
        </button>
        <button type="button" onClick={() => setMatchFilter('unsigned')} className={`px-2 py-2 ${matchFilter === 'unsigned' ? 'bg-navy text-white' : 'bg-white hover:bg-navy-soft'}`}>
          <div className="text-[11px] text-muted">미가입</div>
          <div className="text-[18px] font-bold text-muted">{counts.unsigned.toLocaleString()}</div>
        </button>
      </section>

      {/* 목록 */}
      <section className="border border-border">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[14px] font-bold text-navy">
            전체 명부 ({filtered.length.toLocaleString()}/{members.length.toLocaleString()})
            {matchFilter !== 'all' && (
              <button type="button" onClick={() => setMatchFilter('all')} className="ml-2 text-[11px] text-muted hover:text-navy underline">필터 해제</button>
            )}
          </h2>
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
              className="border border-border px-3 py-1.5 text-[12px] w-56 focus:outline-none focus:border-navy"
            />
          </div>
        </div>
        {/* 헤더 행 */}
        <div className="px-5 py-2 border-b border-border bg-navy-soft text-[11px] font-bold text-navy grid grid-cols-[1fr_1fr_1fr_100px_90px_50px] gap-3">
          <div>네이버 ID</div>
          <div>카페 닉네임</div>
          <div>가입자 닉네임</div>
          <div>매칭 상태</div>
          <div>가입일</div>
          <div></div>
        </div>
        <ul className="divide-y divide-border">
          {filtered.map((m) => {
            const status = matchStatus(m);
            const statusLabel: Record<typeof status, string> = {
              paid: '정회원 ✓',
              free: '미동기화',
              nick_mismatch: '닉네임 불일치',
              unsigned: '미가입',
            };
            const statusColor: Record<typeof status, string> = {
              paid: 'text-cyan',
              free: 'text-amber-600',
              nick_mismatch: 'text-red-600',
              unsigned: 'text-muted',
            };
            return (
              <li key={m.naver_id} className="px-5 py-2 grid grid-cols-[1fr_1fr_1fr_100px_90px_50px] gap-3 items-center text-[12px]">
                <div className="font-bold text-navy truncate">{m.naver_id}</div>
                <div className="truncate">{m.cafe_nickname ?? <span className="text-muted">—</span>}</div>
                <div className="truncate">{m.member_display_name ?? <span className="text-muted">—</span>}</div>
                <div className={`text-[11px] font-bold ${statusColor[status]}`}>{statusLabel[status]}</div>
                <div className="text-[11px] text-muted">{m.registered_at?.slice(0, 10)}</div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => removeOne(m.naver_id)}
                    className="text-[11px] text-muted hover:text-red-600"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-5 py-8 text-center text-[13px] text-muted">결과 없음</li>
          )}
        </ul>
      </section>
    </div>
  );
}
