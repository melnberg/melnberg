'use client';

// 우측 하단 연필 — 어디서든 /threads (스레드 일기장) 으로 빠르게 진입.
// FloatingMapPin (bottom-5) 바로 위에 위치.

import Link from 'next/link';

export default function FloatingThreadPencil() {
  return (
    <Link
      href="/threads"
      aria-label="스레드"
      title="스레드"
      className="fixed bottom-[76px] right-5 z-50 w-11 h-11 rounded-full flex items-center justify-center no-underline bg-[#fff8ec] border-2 border-[#e8d9b8] text-[#5c4634] hover:bg-[#fdf6e3] hover:border-[#c89b6f] hover:text-[#3d2f22] shadow-[0_2px_12px_rgba(120,90,50,0.18)] transition-colors"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21l3.5-1 11-11-2.5-2.5-11 11L3 21z" />
        <path d="M14 7l3 3" />
        <path d="M17 4l2-2 3 3-2 2-3-3z" />
      </svg>
    </Link>
  );
}
