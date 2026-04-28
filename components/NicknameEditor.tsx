'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function NicknameEditor({ initial }: { initial: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    if (!user) {
      setLoading(false);
      setErr('로그인이 필요합니다.');
      return;
    }

    // profiles + auth metadata 둘 다 업데이트 (사이드바·새 글 모두 즉시 반영)
    const [{ error: pErr }, { error: aErr }] = await Promise.all([
      supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id),
      supabase.auth.updateUser({ data: { display_name: trimmed } }),
    ]);

    setLoading(false);
    if (pErr || aErr) {
      setErr((pErr ?? aErr)!.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-[14px] text-text">{initial}</span>
        <button
          type="button"
          onClick={() => { setValue(initial); setErr(null); setEditing(true); }}
          className="text-[11px] font-semibold text-muted hover:text-navy cursor-pointer bg-transparent border-none"
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
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          minLength={2}
          maxLength={20}
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
