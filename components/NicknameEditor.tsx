'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function NicknameEditor({ initial }: { initial: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [value, setValue] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = value !== initial;

  async function handleSave() {
    if (loading) return;
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setErr('닉네임은 2~20자로 입력해주세요.');
      return;
    }
    setErr(null);
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setErr('로그인이 필요합니다.'); return; }

    const [{ error: pErr }, { error: aErr }] = await Promise.all([
      supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id),
      supabase.auth.updateUser({ data: { display_name: trimmed } }),
    ]);

    setLoading(false);
    if (pErr || aErr) { setErr((pErr ?? aErr)!.message); return; }
    setSavedAt(Date.now());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => { setValue(e.target.value); setErr(null); setSavedAt(null); }}
          minLength={2}
          maxLength={20}
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
      {savedAt && !dirty && !err && <div className="text-[11px] text-cyan font-bold">✓ 저장됨</div>}
    </div>
  );
}
