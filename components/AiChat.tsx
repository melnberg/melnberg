'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Footer from './Footer';

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
  showFooter?: boolean;
};

const LOADING_PHASES = [
  // 부동산 분석 실무
  '카페 글 매칭',
  '실거래가 조회',
  '단지 시세 비교',
  '평형별 그룹핑',
  '직거래 필터링',
  '입지 점수 계산',
  '학군 인덱스 조회',
  '재건축 사업성 검토',
  '호재 트래킹',
  '함정단지 검증',
  '단지 서열 매기는 중',
  '시군구 데이터 매칭',
  '매물 후보 추리는 중',
  '평당가 산출',
  '관점 정리',
  '카페 인용 검토',
  // 클로드 코드 스타일 (위트)
  '시세 우려내는 중',
  '데이터 빚는 중',
  '인사이트 다듬는 중',
  '문장 새기는 중',
  '표 짜는 중',
  '결론 갈고 닦는 중',
  '논리 끓이는 중',
  '근거 베이킹',
  '관점 발효 중',
  '의견 숙성 중',
  '단지 픽업',
  '벡터 항해 중',
  '임베딩 추적',
  '컨텍스트 직조',
  '응답 조립',
];

export default function AiChat({ title, subtitle, centered, showFooter }: Props = {}) {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const lastAnswerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fullTextRef = useRef('');
  const animatingRef = useRef(false);

  // 답변 시작 전 라벨 — 매 요청마다 셔플된 순서로 순환 (반복감 줄이기)
  const [shuffledPhases, setShuffledPhases] = useState<string[]>(LOADING_PHASES);
  useEffect(() => {
    const lastTurn = turns[turns.length - 1];
    const cycling = loading && !!lastTurn && lastTurn.answer === '' && !lastTurn.complete;
    if (!cycling) return;
    const shuffled = [...LOADING_PHASES].sort(() => Math.random() - 0.5);
    setShuffledPhases(shuffled);
    setPhaseIdx(0);
    const id = setInterval(() => setPhaseIdx((p) => (p + 1) % shuffled.length), 1100);
    return () => clearInterval(id);
  }, [loading, turns]);

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
    <>
    <div
      style={{ width: 'min(900px, 100%)' }}
      className={`mx-auto px-10 ${showHero && centered ? 'py-20 text-center' : 'py-10'} ${showFooter && showHero ? 'min-h-screen' : ''}`}
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
        <div className="flex flex-col gap-8 mb-8 pb-32 text-left">
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
                  className="border border-border bg-bg/40 p-5 scroll-mb-44"
                >
                  {!turn.complete && i === turns.length - 1 && turn.answer === '' ? (
                    <div className="flex items-center gap-2.5 mb-3" aria-label="답변 생성 중">
                      <div className="relative h-[28px] overflow-hidden flex items-center">
                        <span
                          key={phaseIdx}
                          className="text-[15px] md:text-[16px] font-sans font-bold text-text tracking-tight inline-block"
                          style={{ animation: 'slideUp 0.4s ease-out' }}
                        >
                          {shuffledPhases[phaseIdx] ?? LOADING_PHASES[0]}
                        </span>
                      </div>
                      <span className="relative inline-flex items-center justify-center w-5 h-5" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="absolute w-5 h-5 text-cyan" style={{ animation: 'twinkle 1.4s ease-in-out infinite' }} fill="currentColor">
                          <path d="M12 1L13.8 9.2L22 11L13.8 12.8L12 21L10.2 12.8L2 11L10.2 9.2L12 1Z" />
                        </svg>
                        <svg viewBox="0 0 24 24" className="absolute w-3 h-3 text-navy translate-x-[7px] -translate-y-[7px]" style={{ animation: 'twinkle 1.6s ease-in-out infinite 0.45s' }} fill="currentColor">
                          <path d="M12 1L13.8 9.2L22 11L13.8 12.8L12 21L10.2 12.8L2 11L10.2 9.2L12 1Z" />
                        </svg>
                        <svg viewBox="0 0 24 24" className="absolute w-2 h-2 text-cyan -translate-x-[8px] translate-y-[6px]" style={{ animation: 'twinkle 1.8s ease-in-out infinite 0.9s' }} fill="currentColor">
                          <path d="M12 1L13.8 9.2L22 11L13.8 12.8L12 21L10.2 12.8L2 11L10.2 9.2L12 1Z" />
                        </svg>
                      </span>
                    </div>
                  ) : (
                    <p className="text-[10px] font-bold tracking-widest uppercase text-muted mb-3">멜른버그 답변</p>
                  )}
                  <div className="text-[16px] text-text leading-relaxed text-left">
                    <ReactMarkdown
                      remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
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
                    {!turn.complete && i === turns.length - 1 && turn.answer !== '' && (
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

      <form
        onSubmit={handleSubmit}
        className={hasTurns ? 'sticky bottom-4 z-10 pt-4 pb-2 bg-white' : 'mb-8'}
      >
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
            className="w-full border border-gray-300 focus:border-gray-500 transition-colors px-6 py-4 pr-16 text-[15px] text-left resize-none overflow-hidden outline-none rounded-2xl bg-white shadow-[0_8px_24px_rgba(0,32,96,0.08),0_2px_6px_rgba(0,0,0,0.04)] disabled:bg-gray-50 disabled:cursor-not-allowed min-h-[80px]"
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
        <p className="text-[11px] text-muted text-center mt-2 leading-relaxed">
          입력하신 질문과 답변은 서비스 품질 개선 및 콘텐츠 제작에 활용될 수 있으며, 개인을 식별할 수 있는 정보는 포함되지 않습니다.
        </p>
      </form>
    </div>
    {showFooter && !hasTurns && <Footer />}
    </>
  );
}
