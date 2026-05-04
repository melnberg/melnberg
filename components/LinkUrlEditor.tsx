'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function normalize(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^javascript:/i.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export default function LinkUrlEditor({ initial }: { initial: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [value, setValue] = useState(initial ?? '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = (value.trim() || null) !== (initial?.trim() || null);

  async function handleSave() {
    if (loading) return;
    setErr(null);
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr('로그인이 필요합니다.'); return; }
      const url = normalize(value);
      if (value.trim() && !url) { setErr('잘못된 URL 형식입니다.'); return; }
      if (url && url.length > 500) { setErr('URL이 너무 깁니다 (500자 초과).'); return; }
      const { error: pErr } = await supabase
        .from('profiles')
        .update({ link_url: url })
        .eq('id', user.id);
      if (pErr) { setErr(`저장 실패: ${pErr.message}`); return; }
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
          type="url"
          value={value}
          onChange={(e) => { setValue(e.target.value); setErr(null); setSavedAt(null); }}
          maxLength={500}
          placeholder="https://blog.naver.com/..."
          className="border border-border px-3 py-1.5 text-[14px] outline-none focus:border-navy rounded-none w-64 text-right"
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
