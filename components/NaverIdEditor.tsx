'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function NaverIdEditor({ initial }: { initial: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tierMsg, setTierMsg] = useState<string | null>(null);

  async function handleSave() {
    if (loading) return;
    const trimmed = value.trim();
    setErr(null);
    setTierMsg(null);
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr('로그인이 필요합니다.'); return; }

      const naverId = trimmed || null;

      // profiles UPDATE 후 row 반환 받기 (RLS 검증 + 디버깅)
      const { data: updated, error: pErr } = await supabase
        .from('profiles')
        .update({ naver_id: naverId })
        .eq('id', user.id)
        .select('naver_id')
        .maybeSingle();
      if (pErr) { setErr(`저장 실패: ${pErr.message}`); return; }
      if (!updated) { setErr('저장 실패: 프로필 없음'); return; }

      // 카페 유료회원 매칭
      if (naverId) {
        const { data: matched } = await supabase
          .from('cafe_paid_members')
          .select('naver_id')
          .eq('naver_id', naverId)
          .maybeSingle();
        if (matched) {
          const { error: tErr } = await supabase
            .from('profiles')
            .update({ tier: 'paid', tier_expires_at: '2099-12-31T00:00:00Z' })
            .eq('id', user.id);
          if (!tErr) setTierMsg('카페 유료회원 인증 완료 — 정회원으로 전환됐습니다.');
        }
      }

      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr(`예외: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-[14px] text-text">{initial || <span className="text-muted">미입력</span>}</span>
        <button
          type="button"
          onClick={() => { setValue(initial ?? ''); setErr(null); setTierMsg(null); setEditing(true); }}
          className="text-[11px] font-semibold text-muted hover:text-navy cursor-pointer bg-transparent border-none"
        >
          수정
        </button>
        {tierMsg && <span className="text-[11px] text-cyan font-bold">{tierMsg}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={50}
          placeholder="카페 가입 네이버 ID"
          autoFocus
          className="border border-border border-b-2 border-b-navy px-3 py-1.5 text-[14px] outline-none focus:border-b-cyan rounded-none w-44"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="bg-navy text-white px-3 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-50 border-none"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[12px] text-muted hover:text-text cursor-pointer bg-transparent border-none"
        >
          취소
        </button>
      </div>
      {err && <div className="text-[11px] text-red-700">{err}</div>}
    </div>
  );
}
