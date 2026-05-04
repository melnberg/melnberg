'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SoloEditor({ initial }: { initial: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    const next = !checked;
    setBusy(true);
    setErr(null);
    setChecked(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr('로그인이 필요합니다.'); setChecked(!next); setBusy(false); return; }
    const { error } = await supabase.from('profiles').update({ is_solo: next }).eq('id', user.id);
    if (error) { setErr(`저장 실패: ${error.message}`); setChecked(!next); }
    setBusy(false);
    if (!error) router.refresh();
  }

  return (
    <div className="flex flex-col gap-1 items-end">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={toggle}
          disabled={busy}
          className="w-4 h-4 accent-pink-500"
        />
        <span className="text-[13px] text-text">
          미혼 솔로일 경우 체크 — 닉네임이 <span className="text-pink-500 font-bold">분홍색</span>으로 표시됨
        </span>
      </label>
      {err && <div className="text-[11px] text-red-700">{err}</div>}
    </div>
  );
}
