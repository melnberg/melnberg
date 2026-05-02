'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Source = { id: number; title: string; url: string | null };

type Turn = {
  question: string;
  answer: string;
  sources: Source[];
  complete: boolean;
  error?: string;
};

type Props = {
  title?: string;
  subtitle?: React.ReactNode;
  centered?: boolean;
};

export default function AiChat({ title, subtitle, centered }: Props = {}) {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const lastAnswerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fullTextRef = useRef('');
  const animatingRef = useRef(false);

  function startAnimation() {
    if (animatingRef.current) return;
    animatingRef.current = true;
    const tick = () => {
      setTurns((prev) => {
        if (prev.length === 0) {
          animatingRef.current = false;
          return prev;
        }
        const last = prev[prev.length - 1];
        const target = fullTextRef.current;
        if (last.answer.length >= target.length) {
          animatingRef.current = false;
          return prev;
        }
        const remaining = target.length - last.answer.length;
        const step = remaining > 120 ? 4 : remaining > 40 ? 2 : 1;
        const newAnswer = target.slice(0, last.answer.length + step);
        const updated = prev.slice(0, -1).concat({ ...last, answer: newAnswer });
        return updated;
      });
      if (animatingRef.current) setTimeout(tick, 18);
    };
    tick();
  }

  useEffect(() => {
    const lastTurn = turns[turns.length - 1];
    if (!lastTurn) return;
    if (lastAnswerRef.current) {
      lastAnswerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [turns]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [question]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;

    setQuestion('');
    setLoading(true);
    fullTextRef.current = '';
    animatingRef.current = false;

    setTurns((prev) => [...prev, { question: q, answer: '', sources: [], complete: false }]);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || '오류가 발생했습니다.';
        setTurns((prev) => {
          const last = prev[prev.length - 1];
          return prev.slice(0, -1).concat({ ...last, error: msg, complete: true });
        });
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        setTurns((prev) => {
          const last = prev[prev.length - 1];
          return prev.slice(0, -1).concat({ ...last, error: '스트림 오류', complete: true });
        });
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
              if (data.type === 'sources') {
                setTurns((prev) => {
                  const last = prev[prev.length - 1];
                  return prev.slice(0, -1).concat({ ...last, sources: data.sources });
                });
              } else if (data.type === 'text') {
                fullTextRef.current += data.text;
                startAnimation();
              } else if (data.type === 'error') {
                setTurns((prev) => {
                  const last = prev[prev.length - 1];
                  return prev.slice(0, -1).concat({ ...last, error: data.message, complete: true });
                });
              }
            } catch {}
          }
        }
      }
    } catch {
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        return prev.slice(0, -1).concat({ ...last, error: '네트워크 오류가 발생했습니다.', complete: true });
      });
    } finally {
      setLoading(false);
      setTurns((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        return prev.slice(0, -1).concat({ ...last, complete: true });
      });
    }
  }

  const headTitle = title ?? 'AI 질문';
  const headSubtitle = subtitle ?? (
    <>멜른버그 카페 글을 근거로 답변. <span className="text-cyan font-bold">베타</span></>
  );

  const hasTurns = turns.length > 0;
  const showHero = !hasTurns;

  return (
    <div
      style={{ width: 'min(900px, 100%)' }}
      className={`mx-auto px-10 ${showHero && centered ? 'py-20 text-center' : 'py-10'}`}
    >
      {showHero && (
        <>
          <h1 className={`font-bold text-navy tracking-tight mb-2 ${centered ? 'text-[40px] md:text-[48px] leading-tight' : 'text-[28px]'}`}>{headTitle}</h1>
          <p className={`text-muted mb-8 ${centered ? 'text-[15px]' : 'text-[13px]'}`}>
            {headSubtitle}
          </p>
        </>
      )}

      {hasTurns && (
        <div className="flex flex-col gap-8 mb-8 text-left">
          {turns.map((turn, i) => (
            <div key={i} className="flex flex-col gap-4">
              <div className="flex justify-end">
                <div className="bg-gray-100 text-text px-5 py-3 rounded-2xl max-w-[75%] text-[15px] whitespace-pre-wrap break-words">
                  {turn.question}
                </div>
              </div>

              {turn.error ? (
                <div className="border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-[13px]">
                  {turn.error}
                </div>
              ) : (
                <div
                  ref={i === turns.length - 1 ? lastAnswerRef : null}
                  className="border border-border bg-bg/40 p-5"
                >
                  <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-3">AI 답변</p>
                  <div className="text-[16px] text-text leading-relaxed text-left">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h2 className="text-[24px] font-bold text-navy mt-6 mb-3 first:mt-0">{children}</h2>,
                        h2: ({ children }) => <h2 className="text-[22px] font-bold text-navy mt-6 mb-3 first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-[18px] font-bold text-navy mt-5 mb-2 first:mt-0">{children}</h3>,
                        h4: ({ children }) => <h4 className="text-[16px] font-bold text-navy mt-4 mb-2 first:mt-0">{children}</h4>,
                        p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-6 my-2 space-y-1.5 marker:font-bold marker:text-navy">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        strong: ({ children }) => <strong className="font-bold text-navy">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes('language-');
                          if (isBlock) {
                            return <code className={`block bg-gray-100 p-3 rounded font-mono text-[13px] overflow-x-auto ${className ?? ''}`}>{children}</code>;
                          }
                          return <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-[13.5px] text-navy">{children}</code>;
                        },
                        pre: ({ children }) => <pre className="bg-gray-100 p-3 rounded overflow-x-auto my-3">{children}</pre>,
                        hr: () => <hr className="my-5 border-t border-border" />,
                        blockquote: ({ children }) => <blockquote className="border-l-4 border-cyan/40 pl-4 my-3 text-muted italic">{children}</blockquote>,
                        a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-navy-dark underline hover:text-navy">{children}</a>,
                        table: ({ children }) => <div className="overflow-x-auto my-3"><table className="w-full border-collapse text-[14px]">{children}</table></div>,
                        th: ({ children }) => <th className="border border-border bg-bg/60 px-3 py-2 text-left font-bold">{children}</th>,
                        td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
                      }}
                    >
                      {turn.answer}
                    </ReactMarkdown>
                    {!turn.complete && i === turns.length - 1 && (
                      <span className="inline-block w-1.5 h-4 bg-muted animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                </div>
              )}

              {turn.sources.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-3">참고 자료</p>
                  <ul className="border border-border">
                    {turn.sources.map((s) => (
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
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className={hasTurns ? '' : 'mb-8'}>
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
            placeholder={hasTurns ? '메시지를 입력하세요…' : '궁금한 점을 입력하세요. (Shift+Enter 줄바꿈)'}
            rows={2}
            disabled={loading}
            className="w-full border border-gray-300 focus:border-gray-500 transition-colors px-6 py-4 pr-16 text-[15px] text-left resize-none overflow-hidden outline-none rounded-2xl bg-gradient-to-b from-white to-gray-50 shadow-[0_8px_24px_rgba(0,32,96,0.08),0_2px_6px_rgba(0,0,0,0.04)] disabled:opacity-60 min-h-[80px]"
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
    </div>
  );
}
