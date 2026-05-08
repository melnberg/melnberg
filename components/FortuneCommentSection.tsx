'use client';

// 포춘쿠키 댓글 섹션 — 입력 폼 + 댓글 리스트.
// fortune_comments 테이블 직삽 (RLS 가 author_id = auth.uid() 강제).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Nickname, { type NicknameInfo } from './Nickname';
import { createClient } from '@/lib/supabase/client';
import { revalidateHome } from '@/lib/revalidate-home';

type Comment = {
  id: number;
  author_id: string;
  content: string;
  created_at: string;
  author: NicknameInfo;
};

type Props = {
  fortuneId: number;
  meId: string | null;
  initialComments: Comment[];
};

function relTime(iso: string): string {
  const d = new Date(iso); const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일`;
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function FortuneCommentSection({ fortuneId, meId, initialComments }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    if (!meId) { setErr('로그인이 필요해요'); return; }
    setSubmitting(true);
    setErr(null);
    const { error } = await supabase
      .from('fortune_comments')
      .insert({ fortune_id: fortuneId, author_id: meId, content: trimmed });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    setContent('');
    revalidateHome();
    router.refresh();
  }

  return (
    <section className="max-w-[760px] mx-auto px-4 sm:px-6 py-5">
      <h2 className="text-[14px] font-bold text-navy mb-3">댓글 {initialComments.length}</h2>

      {meId ? (
        <form onSubmit={submit} className="mb-5 flex flex-col gap-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="운세에 대한 한마디"
            rows={3}
            maxLength={500}
            className="w-full border border-border rounded-md px-3 py-2 text-[13px] resize-y focus:outline-none focus:border-emerald-500"
          />
          {err && <div className="text-[12px] text-red-600">{err}</div>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="px-4 py-1.5 text-[12px] font-bold tracking-wide bg-emerald-500 text-white border-none cursor-pointer hover:bg-emerald-600 disabled:bg-[#ccc] disabled:cursor-not-allowed"
            >
              {submitting ? '등록 중...' : '댓글 등록'}
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-5 text-[12px] text-muted bg-bg/50 border border-border px-3 py-2 rounded">
          댓글을 작성하려면 로그인 필요해요.
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {initialComments.length === 0 && (
          <li className="text-[12px] text-muted text-center py-4">아직 댓글이 없어요.</li>
        )}
        {initialComments.map((c) => (
          <li key={c.id} className="border-b border-border pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Nickname info={c.author} />
              <span className="text-[11px] text-muted ml-auto">{relTime(c.created_at)}</span>
            </div>
            <div className="text-[13px] text-text whitespace-pre-wrap break-words leading-relaxed">{c.content}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
