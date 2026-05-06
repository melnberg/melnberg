'use client';

import { useEffect, useState } from 'react';

// 1) 서비스 워커 등록 (오프라인 폴백 + 정적 캐싱)
// 2) Android Chrome `beforeinstallprompt` 캡처 → 우하단 "앱 설치" 배너로 권유
// 3) 설치 거부 / 이미 설치된 경우 배너 숨김 (localStorage 기억)
//
// iOS Safari 는 자동 설치 프롬프트 미지원 → 별도 안내 모달은 추후.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'mlbg.pwa.installDismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

export default function PWAInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // SW 등록 — production 에서만 (dev 에선 캐시 꼬여서 곤란)
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => null);
    }

    // 이미 설치된 PWA (standalone) 면 배너 안 띄움
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // 최근 7일 내 거부했으면 안 띄움
    try {
      const last = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (last && Date.now() - last < DISMISS_TTL_MS) return;
    } catch { /* ignore */ }

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setShow(false);
    setDeferred(null);
  }
  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  if (!show) return null;
  return (
    <div className="fixed bottom-5 left-5 right-5 lg:left-auto lg:right-5 lg:max-w-[320px] z-[60] bg-navy text-white rounded-lg shadow-2xl px-4 py-3 flex items-center gap-3">
      <img src="/logo.svg" alt="" className="w-9 h-9 flex-shrink-0 rounded-full bg-white/10 p-1" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold">멜른버그를 앱처럼</div>
        <div className="text-[11px] text-white/70">홈 화면에 추가하면 풀스크린으로 빠르게.</div>
      </div>
      <button
        type="button"
        onClick={install}
        className="flex-shrink-0 bg-white text-navy text-[12px] font-bold px-3 py-1.5 rounded cursor-pointer border-none hover:bg-white/90"
      >
        설치
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="닫기"
        className="flex-shrink-0 text-white/60 hover:text-white text-[16px] leading-none cursor-pointer bg-transparent border-none"
      >
        ✕
      </button>
    </div>
  );
}
