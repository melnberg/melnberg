'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function normalize(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^javascript:/i.test(t)) return null; // XSS 방지
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export default function LinkUrlEditor({ initial }: { initial: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      <div className="flex items-center gap-3 min-w-0">
        {initial ? (
          <a href={initial} target="_blank" rel="noopener noreferrer"
            className="text-[14px] text-navy underline truncate max-w-[260px]">{initial}</a>
        ) : (
          <span className="text-[14px] text-muted">미입력</span>
        )}
        <button
          type="button"
          onClick={() => { setValue(initial ?? ''); setErr(null); setEditing(true); }}
          className="text-[11px] font-semibold text-muted hover:text-navy cursor-pointer bg-transparent border-none flex-shrink-0"
        >
          수정
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={500}
          placeholder="https://blog.naver.com/..."
          autoFocus
          className="border border-border border-b-2 border-b-navy px-3 py-1.5 text-[14px] outline-none focus:border-b-cyan rounded-none w-64"
        />
        <button type="button" onClick={handleSave} disabled={loading}
          className="bg-navy text-white px-3 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-50 border-none">
          {loading ? '저장 중...' : '저장'}
        </button>
        <button type="button" onClick={() => setEditing(false)}
          className="text-[12px] text-muted hover:text-text cursor-pointer bg-transparent border-none">
          취소
        </button>
      </div>
      {err && <div className="text-[11px] text-red-700">{err}</div>}
    </div>
  );
}
