'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Mode = 'single' | 'bulk';

type UploadResult = { title: string; chunks: number; post_id?: number; error?: string };

export default function CafePostUpload() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('single');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [postedAt, setPostedAt] = useState('');
  const [bulkJson, setBulkJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submitSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch('/api/admin/cafe-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: [{
            title: title.trim(),
            content: content.trim(),
            external_url: externalUrl.trim() || null,
            posted_at: postedAt ? new Date(postedAt).toISOString() : null,
          }],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '업로드 실패');
      } else {
        setResults(json.results ?? []);
        if ((json.results ?? []).every((r: UploadResult) => !r.error)) {
          setTitle(''); setContent(''); setExternalUrl(''); setPostedAt('');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 오류');
    }
    setBusy(false);
    router.refresh();
  }

  async function submitBulk(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(bulkJson);
    } catch {
      setError('JSON 파싱 실패. 형식을 확인해주세요.');
      return;
    }
    const arr = Array.isArray(parsed) ? parsed : null;
    if (!arr) {
      setError('JSON은 배열이어야 합니다.');
      return;
    }
    setBusy(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch('/api/admin/cafe-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: arr }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '업로드 실패');
      } else {
        setResults(json.results ?? []);
        if ((json.results ?? []).every((r: UploadResult) => !r.error)) {
          setBulkJson('');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 오류');
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="border border-border">
      <div className="flex border-b border-border">
        <TabButton active={mode === 'single'} onClick={() => setMode('single')}>단건 업로드</TabButton>
        <TabButton active={mode === 'bulk'} onClick={() => setMode('bulk')}>일괄 업로드 (JSON)</TabButton>
      </div>

      <div className="p-5">
        {mode === 'single' ? (
          <form onSubmit={submitSingle} className="flex flex-col gap-3 max-w-[640px]">
            <Field label="제목 *">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="border border-border border-b-2 border-b-navy px-3 py-2 text-[14px] outline-none focus:border-b-cyan rounded-none w-full"
              />
            </Field>
            <Field label="본문 *">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={10}
                className="border border-border border-b-2 border-b-navy px-3 py-2 text-[13px] outline-none focus:border-b-cyan rounded-none w-full font-sans leading-relaxed resize-y"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="원본 URL (선택)">
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://cafe.naver.com/..."
                  className="border border-border border-b-2 border-b-navy px-3 py-2 text-[13px] outline-none focus:border-b-cyan rounded-none w-full"
                />
              </Field>
              <Field label="작성일 (선택)">
                <input
                  type="date"
                  value={postedAt}
                  onChange={(e) => setPostedAt(e.target.value)}
                  className="border border-border border-b-2 border-b-navy px-3 py-2 text-[13px] outline-none focus:border-b-cyan rounded-none w-full"
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={busy || !title.trim() || !content.trim()}
              className="bg-navy text-white px-5 py-2.5 text-[12px] font-bold tracking-wider uppercase border-none cursor-pointer hover:bg-navy-dark disabled:opacity-50 self-start"
            >
              {busy ? '업로드 중...' : '업로드 + 임베딩'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitBulk} className="flex flex-col gap-3">
            <p className="text-[12px] text-muted leading-relaxed">
              JSON 배열 형식으로 붙여넣기. 각 항목은 다음 필드를 포함:
              <code className="ml-2 px-1.5 py-0.5 bg-bg/60 text-[11px]">title, content, external_url?, posted_at?</code>
            </p>
            <textarea
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
              required
              rows={14}
              placeholder={`[\n  {\n    "title": "예시 제목",\n    "content": "본문 내용...",\n    "external_url": "https://cafe.naver.com/...",\n    "posted_at": "2026-04-01"\n  }\n]`}
              className="border border-border border-b-2 border-b-navy px-3 py-2 text-[12px] font-mono outline-none focus:border-b-cyan rounded-none w-full resize-y"
            />
            <button
              type="submit"
              disabled={busy || !bulkJson.trim()}
              className="bg-navy text-white px-5 py-2.5 text-[12px] font-bold tracking-wider uppercase border-none cursor-pointer hover:bg-navy-dark disabled:opacity-50 self-start"
            >
              {busy ? '업로드 중...' : '일괄 업로드'}
            </button>
          </form>
        )}

        {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}

        {results.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[11px] font-bold tracking-widest uppercase text-muted mb-2">결과</p>
            <ul className="flex flex-col gap-1">
              {results.map((r, i) => (
                <li key={i} className="text-[12px] flex gap-2">
                  <span className={r.error ? 'text-red-600 font-bold' : 'text-cyan font-bold'}>
                    {r.error ? '실패' : `OK (${r.chunks}청크)`}
                  </span>
                  <span className="text-text">{r.title}</span>
                  {r.error && <span className="text-muted text-[11px]">— {r.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-3 text-[12px] font-bold tracking-wider uppercase border-none cursor-pointer ${
        active ? 'bg-navy text-white' : 'bg-white text-muted hover:text-navy'
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold tracking-widest uppercase text-muted">{label}</label>
      {children}
    </div>
  );
}
