'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';

type Mode = 'single' | 'bulk';

type IncomingPost = {
  title: string;
  content: string;
  external_id?: string | null;
  external_url?: string | null;
  posted_at?: string | null;
};

type ServerResult = { external_id: string | null; title: string; chunks: number; post_id?: number; error?: string; skipped?: boolean };

type Counters = {
  total: number;
  done: number;
  ok: number;
  skipped: number;
  failed: number;
};

const BATCH_SIZE = 20; // 한 번에 보낼 글 수 (서버 60s timeout 안전)

export default function CafePostUpload() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<Mode>('single');

  // single
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [postedAt, setPostedAt] = useState('');

  // bulk
  const [bulkJson, setBulkJson] = useState('');
  const [pendingPosts, setPendingPosts] = useState<IncomingPost[]>([]);
  const [counters, setCounters] = useState<Counters>({ total: 0, done: 0, ok: 0, skipped: 0, failed: 0 });
  const [failedBatches, setFailedBatches] = useState<{ start: number; end: number; reason: string }[]>([]);
  const [batchLog, setBatchLog] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [singleResult, setSingleResult] = useState<ServerResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addLog(msg: string) {
    setBatchLog((prev) => [...prev.slice(-200), msg]);
  }

  // ─── 단건 ───
  async function submitSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true);
    setError(null);
    setSingleResult([]);
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
        setSingleResult(json.results ?? []);
        if ((json.results ?? []).every((r: ServerResult) => !r.error)) {
          setTitle(''); setContent(''); setExternalUrl(''); setPostedAt('');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 오류');
    }
    setBusy(false);
    router.refresh();
  }

  // ─── 일괄: JSON 파싱 ───
  function parsePosts(input: unknown): IncomingPost[] | null {
    let arr: unknown = input;
    if (arr && typeof arr === 'object' && 'posts' in arr) {
      arr = (arr as { posts: unknown }).posts;
    }
    if (!Array.isArray(arr)) return null;
    return (arr as Record<string, unknown>[])
      .filter((p) => typeof p?.title === 'string' && typeof p?.content === 'string' && (p.title as string).trim() && (p.content as string).trim())
      .map((p) => ({
        title: (p.title as string).trim(),
        content: (p.content as string).trim(),
        external_id: typeof p.external_id === 'string' ? p.external_id : null,
        external_url: typeof p.external_url === 'string' ? p.external_url : null,
        posted_at: typeof p.posted_at === 'string' ? p.posted_at : null,
      }));
  }

  function loadFromText(text: string) {
    setError(null);
    try {
      const parsed = JSON.parse(text);
      const posts = parsePosts(parsed);
      if (!posts || posts.length === 0) {
        setError('JSON에 유효한 글이 없습니다. {posts: [...]} 또는 [...] 형식이어야 합니다.');
        return;
      }
      setPendingPosts(posts);
      setCounters({ total: posts.length, done: 0, ok: 0, skipped: 0, failed: 0 });
      setFailedBatches([]);
      setBatchLog([]);
      addLog(`📦 ${posts.length}건 적재 준비 완료`);
    } catch {
      setError('JSON 파싱 실패. 형식을 확인해주세요.');
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    loadFromText(text);
    e.target.value = ''; // 같은 파일 재선택 가능하게
  }

  function loadFromTextarea() {
    if (!bulkJson.trim()) {
      setError('JSON을 입력해주세요.');
      return;
    }
    loadFromText(bulkJson);
  }

  // ─── 일괄 업로드 ───
  async function uploadBatch(posts: IncomingPost[], startIdx: number, endIdx: number): Promise<{ ok: boolean; results?: ServerResult[]; error?: string }> {
    try {
      const res = await fetch('/api/admin/cafe-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
      return { ok: true, results: json.results ?? [] };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '네트워크 오류' };
    }
  }

  async function startBulkUpload() {
    if (busy || pendingPosts.length === 0) return;
    setBusy(true);
    setError(null);
    setFailedBatches([]);
    setCounters({ total: pendingPosts.length, done: 0, ok: 0, skipped: 0, failed: 0 });

    let done = 0, ok = 0, skipped = 0, failed = 0;
    const failedBatchList: { start: number; end: number; reason: string }[] = [];

    for (let i = 0; i < pendingPosts.length; i += BATCH_SIZE) {
      const slice = pendingPosts.slice(i, i + BATCH_SIZE);
      const startNum = i + 1;
      const endNum = i + slice.length;
      addLog(`🔄 배치 ${startNum}–${endNum} 업로드 중...`);

      const res = await uploadBatch(slice, i, i + slice.length);
      if (!res.ok) {
        failed += slice.length;
        failedBatchList.push({ start: i, end: i + slice.length, reason: res.error ?? '알 수 없음' });
        addLog(`❌ 배치 ${startNum}–${endNum} 실패: ${res.error}`);
      } else {
        for (const r of res.results ?? []) {
          if (r.skipped) skipped++;
          else if (r.error) failed++;
          else ok++;
        }
        addLog(`✅ 배치 ${startNum}–${endNum} 완료 (성공 ${res.results?.filter((r) => !r.error && !r.skipped).length ?? 0} / 중복 ${res.results?.filter((r) => r.skipped).length ?? 0} / 실패 ${res.results?.filter((r) => r.error).length ?? 0})`);
      }

      done += slice.length;
      setCounters({ total: pendingPosts.length, done, ok, skipped, failed });
    }

    setFailedBatches(failedBatchList);
    setBusy(false);
    addLog(`🎉 전체 완료: 성공 ${ok} / 중복 ${skipped} / 실패 ${failed} / 총 ${pendingPosts.length}`);
    router.refresh();
  }

  async function retryFailedBatches() {
    if (busy || failedBatches.length === 0) return;
    setBusy(true);
    addLog(`🔁 실패 배치 ${failedBatches.length}건 재시도`);
    const stillFailed: typeof failedBatches = [];
    let retryOk = 0, retrySkip = 0, retryFail = 0;

    for (const fb of failedBatches) {
      const slice = pendingPosts.slice(fb.start, fb.end);
      const res = await uploadBatch(slice, fb.start, fb.end);
      if (!res.ok) {
        stillFailed.push({ ...fb, reason: res.error ?? fb.reason });
        retryFail += slice.length;
        addLog(`❌ 재시도 ${fb.start + 1}–${fb.end} 실패: ${res.error}`);
      } else {
        for (const r of res.results ?? []) {
          if (r.skipped) retrySkip++;
          else if (r.error) retryFail++;
          else retryOk++;
        }
        addLog(`✅ 재시도 ${fb.start + 1}–${fb.end} 성공`);
      }
    }

    setFailedBatches(stillFailed);
    setCounters((prev) => ({
      ...prev,
      ok: prev.ok + retryOk,
      skipped: prev.skipped + retrySkip,
      failed: prev.failed - (retryOk + retrySkip),
    }));
    setBusy(false);
    router.refresh();
  }

  function resetBulk() {
    setPendingPosts([]);
    setBulkJson('');
    setCounters({ total: 0, done: 0, ok: 0, skipped: 0, failed: 0 });
    setFailedBatches([]);
    setBatchLog([]);
    setError(null);
  }

  const progress = counters.total > 0 ? Math.round((counters.done / counters.total) * 100) : 0;

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

            {error && <p className="text-[12px] text-red-600">{error}</p>}

            {singleResult.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <ul className="flex flex-col gap-1">
                  {singleResult.map((r, i) => (
                    <li key={i} className="text-[12px] flex gap-2">
                      <span className={r.error ? 'text-red-600 font-bold' : r.skipped ? 'text-muted font-bold' : 'text-cyan font-bold'}>
                        {r.error ? '실패' : r.skipped ? '중복(skip)' : `OK (${r.chunks}청크)`}
                      </span>
                      <span className="text-text">{r.title}</span>
                      {r.error && <span className="text-muted">— {r.error}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {pendingPosts.length === 0 ? (
              <>
                <p className="text-[12px] text-muted leading-relaxed">
                  카페 추출 스크립트로 받은 JSON 파일을 업로드하거나 직접 붙여넣어주세요.
                  <br />
                  <code className="text-[11px] bg-bg/60 px-1.5 py-0.5">{`{posts: [{title, content, external_id?, external_url?, posted_at?}]}`}</code> 또는 배열 그대로.
                </p>

                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-[11px] font-bold tracking-widest uppercase text-muted block mb-2">파일 업로드</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleFileChange}
                      className="text-[13px]"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold tracking-widest uppercase text-muted block mb-2">또는 JSON 직접 붙여넣기</label>
                    <textarea
                      value={bulkJson}
                      onChange={(e) => setBulkJson(e.target.value)}
                      rows={10}
                      placeholder={`{\n  "posts": [\n    { "title": "...", "content": "...", "external_url": "..." }\n  ]\n}`}
                      className="border border-border border-b-2 border-b-navy px-3 py-2 text-[12px] font-mono outline-none focus:border-b-cyan rounded-none w-full resize-y"
                    />
                    <button
                      type="button"
                      onClick={loadFromTextarea}
                      className="mt-2 bg-white border border-border text-text px-4 py-2 text-[12px] font-semibold tracking-wide cursor-pointer hover:border-navy hover:text-navy"
                    >
                      JSON 적재
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <p className="text-[14px] font-bold text-navy">
                    적재 완료: <span className="tabular-nums">{counters.total}</span>건 — {BATCH_SIZE}개씩 배치 업로드
                  </p>
                  <button
                    type="button"
                    onClick={resetBulk}
                    disabled={busy}
                    className="text-[11px] text-muted hover:text-navy bg-transparent border-none cursor-pointer disabled:opacity-50"
                  >
                    초기화
                  </button>
                </div>

                {/* 진행률 바 */}
                <div className="border border-border bg-bg/40 p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-[12px] font-bold text-navy">{counters.done} / {counters.total}</span>
                    <span className="text-[11px] tabular-nums text-muted">{progress}%</span>
                  </div>
                  <div className="h-2 bg-border relative">
                    <div className="absolute inset-y-0 left-0 bg-cyan transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex gap-4 mt-3 text-[11px] tabular-nums">
                    <span className="text-cyan">✓ 성공 {counters.ok}</span>
                    <span className="text-muted">↺ 중복 {counters.skipped}</span>
                    <span className="text-red-600">✗ 실패 {counters.failed}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={startBulkUpload}
                    disabled={busy || counters.done > 0}
                    className="bg-navy text-white px-5 py-2.5 text-[12px] font-bold tracking-wider uppercase border-none cursor-pointer hover:bg-navy-dark disabled:opacity-50"
                  >
                    {busy ? `업로드 중... (${counters.done}/${counters.total})` : counters.done === 0 ? '업로드 시작' : '완료'}
                  </button>
                  {failedBatches.length > 0 && !busy && (
                    <button
                      type="button"
                      onClick={retryFailedBatches}
                      className="bg-white border border-red-300 text-red-700 px-5 py-2.5 text-[12px] font-bold tracking-wider uppercase cursor-pointer hover:bg-red-50"
                    >
                      실패 {failedBatches.length}개 재시도
                    </button>
                  )}
                </div>

                {batchLog.length > 0 && (
                  <div className="border border-border bg-bg/30 p-3 max-h-[260px] overflow-y-auto font-mono text-[11px] leading-relaxed">
                    {batchLog.map((line, i) => (
                      <div key={i} className={line.includes('❌') ? 'text-red-600' : line.includes('🎉') ? 'text-cyan font-bold' : 'text-text'}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {error && <p className="text-[12px] text-red-600">{error}</p>}
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
