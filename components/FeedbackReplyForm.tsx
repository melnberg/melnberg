'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Props = {
  feedbackId: number;
  initialReply: string | null;
  repliedAt: string | null;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function FeedbackReplyForm({ feedbackId, initialReply, repliedAt }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [reply, setReply] = useState(initialReply ?? '');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(!initialReply);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    const trimmed = reply.trim();
    if (!trimmed) { setErr('답글 내용을 입력해주세요.'); return; }
    setSaving(true);
    setErr(null);
    const { error } = await supabase
      .from('feedback')
      .update({ admin_reply: trimmed })
      .eq('id', feedbackId);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setEditing(false);
    router.refresh();
  }

  if (!editing && initialReply) {
    return (
      <div className="mt-3 pt-3 border-t border-[#e5e7eb] bg-navy-soft px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold tracking-wider uppercase text-navy">관리자 답글</span>
          <div className="flex items-center gap-2">
            {repliedAt && <span className="text-[10px] text-muted">{fmtDate(repliedAt)}</span>}
            <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-navy hover:underline">수정</button>
          </div>
        </div>
        <p className="text-[13px] text-text whitespace-pre-wrap leading-relaxed">{initialReply}</p>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-[#e5e7eb] flex flex-col gap-2">
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="답글 입력 (사용자 알림으로 발송됨)"
        rows={2}
        className="border border-border px-3 py-2 text-[13px] outline-none focus:border-navy resize-y"
      />
      <div className="flex items-center gap-2 justify-end">
        {err && <span className="text-[11px] text-red-700 mr-auto">{err}</span>}
        {initialReply && (
          <button type="button" onClick={() => { setEditing(false); setReply(initialReply); setErr(null); }} disabled={saving} className="px-3 py-1.5 text-[11px] text-muted hover:text-navy">취소</button>
        )}
        <button type="button" onClick={save} disabled={saving} className="px-4 py-1.5 bg-navy text-white text-[11px] font-bold hover:bg-navy-dark disabled:opacity-50">
          {saving ? '저장 중...' : initialReply ? '수정 저장' : '답글 등록'}
        </button>
      </div>
    </div>
  );
}
