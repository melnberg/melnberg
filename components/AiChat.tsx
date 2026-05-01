'use client';

import { useEffect, useRef, useState } from 'react';

type Source = { id: number; title: string; url: string | null };

type Props = {
  title?: string;
  subtitle?: React.ReactNode;
  centered?: boolean;
};

export default function AiChat({ title, subtitle, centered }: Props = {}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
    }
  }, [answer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);
    setAnswer('');
    setSources([]);
    setError('');

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '오류가 발생했습니다.');
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        setError('스트림 오류');
        setLoading(false);
        return;
      }

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'sources') setSources(data.sources);
              else if (data.type === 'text') setAnswer((prev) => prev + data.text);
              else if (data.type === 'error') setError(data.message);
            } catch {}
          }
        }
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const headTitle = title ?? 'AI 질문';
  const headSubtitle = subtitle ?? (
    <>멜른버그 카페 글을 근거로 답변. <span className="text-cyan font-bold">베타</span></>
  );

  return (
    <div className={`max-w-[680px] mx-auto px-6 ${centered ? 'py-20 text-center' : 'py-10'}`}>
      <h1 className={`font-bold text-navy tracking-tight mb-2 ${centered ? 'text-[40px] md:text-[48px] leading-tight' : 'text-[28px]'}`}>{headTitle}</h1>
      <p className={`text-muted mb-8 ${centered ? 'text-[15px]' : 'text-[13px]'}`}>
        {headSubtitle}
      </p>

      <form onSubmit={handleSubmit} className="mb-8">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder="궁금한 점을 입력하세요. (Shift+Enter 줄바꿈)"
          rows={3}
          disabled={loading}
          className="w-full border border-border border-b-2 border-b-navy px-4 py-3 text-[14px] resize-y outline-none focus:border-b-cyan rounded-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="mt-3 bg-navy text-white px-6 py-3 text-[12px] font-bold tracking-wider uppercase border-none cursor-pointer hover:bg-navy-dark disabled:opacity-50"
        >
          {loading ? '답변 생성 중...' : '질문하기'}
        </button>
      </form>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-[13px] mb-6">
          {error}
        </div>
      )}

      {(answer || loading) && (
        <div className="border border-border bg-bg/40 p-5 mb-6">
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-3">AI 답변</p>
          <div
            ref={answerRef}
            className="text-[14px] text-text whitespace-pre-wrap leading-relaxed max-h-[480px] overflow-y-auto"
          >
            {answer}
            {loading && <span className="inline-block w-1.5 h-4 bg-muted animate-pulse ml-0.5 align-middle" />}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-3">참고 자료</p>
          <ul className="border border-border">
            {sources.map((s) => (
              <li key={s.id} className="border-b border-border last:border-b-0 px-4 py-2.5">
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-navy no-underline hover:underline"
                  >
                    {s.title}
                  </a>
                ) : (
                  <span className="text-[13px] text-text">{s.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
