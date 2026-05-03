'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DeleteAccountButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm('정말 회원 탈퇴하시겠어요?\n\n작성한 글·댓글·점거 기록은 유지되지만 작성자 정보는 사라집니다.')) return;
    if (!confirm('마지막 확인 — 탈퇴 후 복구 불가합니다. 진행할까요?')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/me/delete', { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(`탈퇴 실패: ${json.error ?? res.statusText}`);
        setLoading(false);
        return;
      }
      // 클라이언트 세션 종료
      await createClient().auth.signOut();
      alert('회원 탈퇴가 완료됐습니다.');
      router.push('/');
      router.refresh();
    } catch (e) {
      alert(`오류: ${e instanceof Error ? e.message : String(e)}`);
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="text-[12px] text-muted hover:text-red-600 underline underline-offset-4 disabled:opacity-50"
    >
      {loading ? '탈퇴 처리중...' : '회원 탈퇴하기'}
    </button>
  );
}
