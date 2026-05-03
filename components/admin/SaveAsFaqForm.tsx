'use client';

import { useState } from 'react';

type Props = {
  logId: number;
  defaultTitle: string;
  defaultContent: string;
  existingPostId: number | null;
};

export default function SaveAsFaqForm({ logId, defaultTitle, defaultContent, existingPostId }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState(defaultContent);
  const [saving, setSaving] = useState(false);
  const [savedPostId, setSavedPostId] = useState<number | null>(existingPostId);
  const [chunkCount, setChunkCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/faq-from-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId, title: title.trim(), content: content.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '저장 실패');
      } else {
        setSavedPostId(json.post_id);
        setChunkCount(json.chunks);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('이 FAQ 글을 검색에서 제거할까요?')) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/faq-from-log?log_id=${logId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '삭제 실패');
      } else {
        setSavedPostId(null);
        setChunkCount(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] font-bold tracking-wider uppercase px-3 py-1.5 border border-navy text-navy hover:bg-navy hover:text-white"
        >
          {savedPostId ? 'FAQ 수정' : 'FAQ로 저장'}
        </button>
        {savedPostId && (
          <span className="text-[11px] text-cyan font-bold">
            ✓ FAQ 등록됨 (post #{savedPostId})
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <p className="text-[10px] font-bold tracking-widest uppercase text-muted">
        FAQ 편집 — 저장하면 검색 RAG에 즉시 반영됨
      </p>
      <div>
        <label className="block text-[11px] font-bold text-muted mb-1">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-navy"
          placeholder="질문 형태로 작성"
        />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-muted mb-1">본문 (마크다운)</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className="w-full border border-border px-3 py-2 text-[13px] font-mono leading-relaxed focus:outline-none focus:border-navy"
          placeholder="답변을 다듬어서 작성"
        />
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      {savedPostId && chunkCount !== null && !error && (
        <p className="text-[12px] text-cyan">
          ✓ 저장 완료 — post #{savedPostId}, 청크 {chunkCount}개
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !title.trim() || !content.trim()}
          className="text-[11px] font-bold tracking-wider uppercase px-3 py-1.5 bg-navy text-white hover:bg-navy-dark disabled:opacity-50"
        >
          {saving ? '저장 중...' : savedPostId ? '덮어쓰기' : '저장'}
        </button>
        {savedPostId && (
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="text-[11px] font-bold tracking-wider uppercase px-3 py-1.5 border border-red-600 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50"
          >
            검색에서 제거
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] font-bold tracking-wider uppercase px-3 py-1.5 border border-border text-muted hover:text-navy"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
