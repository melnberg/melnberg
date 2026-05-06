'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 어드민 — 사이트 공지 작성 (카페 새 글 푸시 등)
// 제목 + 링크만 필수, 본문은 옵션. 제출 시 텔레그램 + 홈 피드 동시 푸시.
export default function AdminAnnouncementForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) { setMsg('제목 필수'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), link_url: link.trim() || null, body: body.trim() || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(`발송 실패: ${j?.error ?? r.status}`); setBusy(false); return; }
      setMsg(`✅ 공지 #${j.id} 등록 + 텔레그램 ${j.telegram === 'sent' ? '발송됨' : '실패 (' + j.telegram + ')'}`);
      setTitle(''); setLink(''); setBody('');
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '실패');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="border border-border bg-bg/30 px-5 py-4 flex flex-col gap-3">
      <div className="text-[14px] font-bold text-navy">📣 사이트 공지 작성 (카페 새 글 등)</div>
      <p className="text-[11px] text-muted -mt-1">제출 시 홈 피드 상단 + 텔레그램 채널 자동 발송.</p>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold tracking-widest uppercase text-muted">제목 *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 카페 새 글 — 구리를 보는 복잡한 심경"
          maxLength={200}
          required
          className="px-3 py-2 border border-border focus:border-navy text-[13px] outline-none rounded-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold tracking-widest uppercase text-muted">링크 (선택)</label>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://cafe.naver.com/..."
          className="px-3 py-2 border border-border focus:border-navy text-[13px] outline-none rounded-none font-mono"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold tracking-widest uppercase text-muted">요약 (선택)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="짧은 요약 — 텔레그램·피드 본문에 노출 (최대 280자 자동 트림)"
          rows={3}
          maxLength={500}
          className="px-3 py-2 border border-border focus:border-navy text-[13px] outline-none rounded-none resize-y"
        />
      </div>

      {msg && (
        <div className={`text-[12px] px-3 py-2 ${msg.startsWith('✅') ? 'bg-cyan/10 text-navy' : 'bg-red-50 text-red-700'}`}>
          {msg}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="bg-navy text-white px-5 py-2 text-[13px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed border-none"
        >
          {busy ? '발송중...' : '📣 공지 발송'}
        </button>
      </div>
    </form>
  );
}
