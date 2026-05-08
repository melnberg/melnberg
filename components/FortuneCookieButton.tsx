'use client';

// 포춘쿠키 버튼 — 사이드바 3번 위치, 출석룰렛 폐지 후 자리잡음.
// 오로라 초록 그라디언트 + 쿠키 SVG. 누르면 오늘의 운세 1회 뽑음 (KST 일자 기준).
// 결과는 모달로 표시되고, 동시에 피드(fortune_cookies 테이블)에 본인 이름 + 운세 내용으로 카드 등장.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { revalidateHome } from '@/lib/revalidate-home';

type Fortune = { id: number; fortune_text: string; drawn_date: string; created_at: string };

function CookieIcon({ size = 16 }: { size?: number }) {
  // 쿠키 — 둥근 본체 + 갈라진 틈 + 종이 쪼가리. 흰색 stroke 으로 오로라 위에 떠 보임.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="#FFE7B0" stroke="#FFFFFF" strokeWidth="1.4" />
      <circle cx="8.5" cy="9" r="0.9" fill="#C97A2A" />
      <circle cx="14.5" cy="8.5" r="0.7" fill="#C97A2A" />
      <circle cx="13.5" cy="14" r="0.8" fill="#C97A2A" />
      <circle cx="9" cy="14.5" r="0.6" fill="#C97A2A" />
      <path d="M5 13 C 8 16, 16 16, 19 13" stroke="#C97A2A" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M11 11.5 L 13 11.5 L 13 17 L 11 17 Z" fill="#FFFFFF" stroke="#C97A2A" strokeWidth="0.7" />
    </svg>
  );
}

export default function FortuneCookieButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [fortune, setFortune] = useState<Fortune | null>(null);
  const [already, setAlready] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const today = new Date();
  const label = `${today.getMonth() + 1}월 ${today.getDate()}일 포춘쿠키`;

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setOpen(true);
    setRevealed(false);
    setDrawing(true);
    try {
      const res = await fetch('/api/fortune/draw', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) {
        setErr(j?.error ?? '뽑기 실패');
        setDrawing(false);
        return;
      }
      setFortune(j.fortune as Fortune);
      setAlready(!!j.already);
      // 짧은 두근 애니메이션 후 reveal
      setTimeout(() => { setDrawing(false); setRevealed(true); }, 1200);
      // 새로 뽑았을 때만 피드 새로고침
      if (!j.already) revalidateHome();
    } catch {
      setErr('네트워크 오류');
      setDrawing(false);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setFortune(null);
    setErr(null);
    setRevealed(false);
    if (fortune && !already) router.refresh();
  }

  const modal = open && mounted ? createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
      <div
        className="relative w-[340px] p-7 bg-white border-4 border-emerald-400 shadow-[0_8px_40px_rgba(16,185,129,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-[12px] font-bold tracking-widest uppercase text-emerald-600 mb-2">{label}</div>
          {drawing ? (
            <>
              <div className="text-[60px] mb-2 inline-block animate-bounce">🥠</div>
              <div className="text-[14px] font-bold text-text">쿠키 깨는 중...</div>
            </>
          ) : err ? (
            <>
              <div className="text-[40px] mb-2">😓</div>
              <div className="text-[14px] font-bold text-red-600">{err}</div>
            </>
          ) : fortune ? (
            <>
              <div className="text-[60px] mb-2">🥠</div>
              <div className={`text-[14px] leading-relaxed text-text whitespace-pre-wrap break-words ${revealed ? 'animate-fade-in' : 'opacity-0'}`}>
                {fortune.fortune_text}
              </div>
              {already && (
                <div className="mt-3 text-[11px] text-muted">오늘은 이미 한 번 뽑았어요. 내일 다시!</div>
              )}
              <button
                type="button"
                onClick={close}
                className="mt-5 w-full px-4 py-2 text-[13px] font-bold tracking-wide cursor-pointer border-none bg-emerald-500 text-white hover:bg-emerald-600"
              >
                확인
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="fortune-aurora group relative w-full px-2 py-2 text-[12px] font-bold text-white border-none cursor-pointer overflow-hidden flex items-center justify-center gap-1.5"
        title="오늘의 포춘쿠키 — 1일 1회"
      >
        <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap drop-shadow-sm">
          <CookieIcon size={14} />
          <span>{label}</span>
        </span>
        <span aria-hidden className="fortune-aurora-shine" />
      </button>
      {modal}
    </>
  );
}
