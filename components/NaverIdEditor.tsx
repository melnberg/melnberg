'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function NaverIdEditor({ initial }: { initial: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [value, setValue] = useState(initial ?? '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tierMsg, setTierMsg] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = (value.trim() || null) !== (initial?.trim() || null);

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
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        const nickname = (profile as { display_name?: string | null } | null)?.display_name;
        if (nickname) {
          const { data: matched } = await supabase
            .from('cafe_paid_members')
            .select('naver_id')
            .eq('naver_id', naverId)
            .eq('cafe_nickname', nickname)
            .maybeSingle();
          if (matched) {
            const { error: tErr } = await supabase
              .from('profiles')
              .update({ tier: 'paid', tier_expires_at: '2099-12-31T00:00:00Z' })
              .eq('id', user.id);
            if (!tErr) setTierMsg('카페 유료회원 인증 완료 — 조합원으로 전환됐습니다.');
          }
        }
      }

      setSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setErr(`예외: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setErr(null); setSavedAt(null); }}
          maxLength={50}
          placeholder="카페 가입 네이버 ID"
          className="border border-border px-3 py-1.5 text-[14px] outline-none focus:border-navy rounded-none w-44 text-right"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty}
          className="bg-navy text-white px-3 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-30 disabled:cursor-not-allowed border-none whitespace-nowrap"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
      {err && <div className="text-[11px] text-red-700">{err}</div>}
      {savedAt && !dirty && !err && !tierMsg && <div className="text-[11px] text-cyan font-bold">✓ 저장됨</div>}
      {tierMsg && <div className="text-[11px] text-cyan font-bold">{tierMsg}</div>}
    </div>
  );
}
