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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fullTextRef = useRef('');
  const animatingRef = useRef(false);

  function startAnimation() {
    if (animatingRef.current) return;
    animatingRef.current = true;
    const tick = () => {
      setAnswer((prev) => {
        const target = fullTextRef.current;
        if (prev.length >= target.length) {
          animatingRef.current = false;
          return prev;
        }
        const remaining = target.length - prev.length;
        const step = remaining > 120 ? 4 : remaining > 40 ? 2 : 1;
        return target.slice(0, prev.length + step);
      });
      if (animatingRef.current) setTimeout(tick, 18);
    };
    tick();
  }

  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
    }
  }, [answer]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [question]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);
    setAnswer('');
    setSources([]);
    setError('');
    fullTextRef.current = '';
    animatingRef.current = false;

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
              else if (data.type === 'text') {
                fullTextRef.current += data.text;
                startAnimation();
              }
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
    <div className={`max-w-[1900px] mx-auto px-6 ${centered ? 'py-20 text-center' : 'py-10'}`}>
      <h1 className={`font-bold text-navy tracking-tight mb-2 ${centered ? 'text-[40px] md:text-[48px] leading-tight' : 'text-[28px]'}`}>{headTitle}</h1>
      <p className={`text-muted mb-8 ${centered ? 'text-[15px]' : 'text-[13px]'}`}>
        {headSubtitle}
      </p>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder="궁금한 점을 입력하세요. (Shift+Enter 줄바꿈)"
            rows={2}
            disabled={loading}
            className="w-full border border-gray-300 focus:border-gray-500 transition-colors px-5 py-4 pr-16 text-[14px] text-left resize-none overflow-hidden outline-none rounded-2xl bg-gradient-to-b from-white to-gray-50 shadow-[0_8px_24px_rgba(0,32,96,0.08),0_2px_6px_rgba(0,0,0,0.04)] disabled:opacity-60 min-h-[80px]"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            aria-label={loading ? '답변 생성 중' : '질문하기'}
            className="absolute right-3 bottom-3 bg-navy text-white w-10 h-10 rounded-lg flex items-center justify-center border-none cursor-pointer hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              </svg>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-[13px] mb-6">
          {error}
        </div>
      )}

      {(answer || loading) && (
        <div className="border border-border bg-bg/40 p-5 mb-6 text-left">
          <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-3">AI 답변</p>
          <div
            ref={answerRef}
            className="text-[16px] text-text leading-relaxed max-h-[560px] overflow-y-auto text-left"
          >
            {renderStructured(answer)}
            {loading && <span className="inline-block w-1.5 h-4 bg-muted animate-pulse ml-0.5 align-middle" />}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div className="text-left">
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

function renderStructured(text: string) {
  if (!text) return null;
  // ** 굵게 잔여물이 들어와도 별표는 제거
  const cleaned = text.replace(/\*\*/g, '');
  const lines = cleaned.split('\n');
  return lines.map((line, i) => {
    if (line.trim() === '') return <div key={i} className="h-3" />;
    // 1.1.1 같은 깊은 소제목
    const lvl3 = line.match(/^(\d+\.\d+\.\d+)(\s+)(.+)$/);
    if (lvl3) {
      return (
        <div key={i} className="text-[16px] font-bold text-navy mt-3 mb-1">
          <span className="text-cyan mr-2">{lvl3[1]}</span>{lvl3[3]}
        </div>
      );
    }
    // 1.1 같은 소제목
    const lvl2 = line.match(/^(\d+\.\d+)(\s+)(.+)$/);
    if (lvl2) {
      return (
        <div key={i} className="text-[18px] font-bold text-navy mt-4 mb-1">
          <span className="text-cyan mr-2">{lvl2[1]}</span>{lvl2[3]}
        </div>
      );
    }
    // 1. 같은 대제목
    const lvl1 = line.match(/^(\d+)\.\s+(.+)$/);
    if (lvl1) {
      return (
        <div key={i} className="text-[22px] font-bold text-navy mt-6 mb-2 first:mt-0">
          <span className="text-cyan mr-2">{lvl1[1]}.</span>{lvl1[2]}
        </div>
      );
    }
    return <div key={i} className="whitespace-pre-wrap">{line}</div>;
  });
}
