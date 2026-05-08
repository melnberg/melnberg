'use client';

// 포춘쿠키 버튼 — 사이드바 3번 위치, 출석룰렛 폐지 후 자리잡음.
// 오로라 초록 그라디언트 + 쿠키 SVG. 누르면 오늘의 운세 1회 뽑음 (KST 일자 기준).
// 결과는 모달로 표시되고, 동시에 피드(fortune_cookies 테이블)에 본인 이름 + 운세 내용으로 카드 등장.
// 오늘치를 이미 뽑은 상태면 오로라/광택 애니메이션 끔 — 정적 회색 톤.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { revalidateHome } from '@/lib/revalidate-home';

type Fortune = { id: number; fortune_text: string; drawn_date: string; created_at: string };

// Kakao JS SDK 동적 로드 (한번만). NEXT_PUBLIC_KAKAO_MAP_KEY 가 같은 JS 키.
declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share?: { sendDefault: (params: Record<string, unknown>) => void };
    };
  }
}

async function ensureKakaoLoaded(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  if (!key) return false;
  if (window.Kakao?.Share) {
    if (!window.Kakao.isInitialized()) window.Kakao.init(key);
    return true;
  }
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-kakao-sdk]');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const s = document.createElement('script');
    s.src = 'https://developers.kakao.com/sdk/js/kakao.min.js';
    s.async = true;
    s.setAttribute('data-kakao-sdk', '1');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Kakao SDK 로드 실패'));
    document.head.appendChild(s);
  }).catch(() => null);
  if (!window.Kakao) return false;
  if (!window.Kakao.isInitialized()) window.Kakao.init(key);
  return !!window.Kakao.Share;
}

function CookieIcon({ size = 18 }: { size?: number }) {
  // 쿠키 — 검정 선화. 반달 본체 + 갈라진 틈 + 튀어나온 종이.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* 본체 — 둥근 쿠키 */}
      <circle cx="12" cy="13" r="8.5" />
      {/* 갈라진 틈 (지그재그) */}
      <path d="M5 12 L 8 12.5 L 9.5 11.5 L 11 12.5 L 12.5 11.5 L 14 12.5 L 15.5 11.5 L 17 12.5 L 19 12" />
      {/* 종이 쪼가리 */}
      <path d="M11 12 L 11 17 L 13 17 L 13 12" />
    </svg>
  );
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
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
  // 오늘치 이미 뽑았는지 — true 면 오로라/광택 애니메이션 끔.
  const [drawnToday, setDrawnToday] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // 마운트 시 오늘치 있는지 확인. 있으면 애니메이션 정지 상태로 시작.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data } = await supabase
        .from('fortune_cookies')
        .select('id')
        .eq('user_id', user.id)
        .eq('drawn_date', kstToday())
        .is('deleted_at', null)
        .maybeSingle();
      if (cancelled) return;
      if (data) setDrawnToday(true);
    })();
    return () => { cancelled = true; };
  }, []);

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
      setDrawnToday(true);  // 뽑힘 → 즉시 애니메이션 정지
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

  async function shareKakao(f: Fortune) {
    if (sharing) return;
    setSharing(true);
    try {
      const ok = await ensureKakaoLoaded();
      if (!ok || !window.Kakao?.Share) {
        alert('카카오톡 공유를 사용할 수 없어요. 카카오 키 확인 필요');
        return;
      }
      const origin = window.location.origin;
      const link = `${origin}/fortune/${f.id}`;
      const imageUrl = `${origin}/api/og/fortune/${f.id}`;
      const d = new Date(f.drawn_date);
      const dateLabel = `${d.getMonth() + 1}월 ${d.getDate()}일`;
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: `🥠 ${dateLabel} 포춘쿠키`,
          description: f.fortune_text,
          imageUrl,
          imageWidth: 800,
          imageHeight: 800,
          link: { mobileWebUrl: link, webUrl: link },
        },
        buttons: [
          { title: '운세 보러가기', link: { mobileWebUrl: link, webUrl: link } },
        ],
      });
    } catch (e) {
      console.error('Kakao share error', e);
      alert('공유 실패');
    } finally {
      setSharing(false);
    }
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
              <div
                className={`text-[15px] leading-loose text-text whitespace-pre-wrap break-keep ${revealed ? 'animate-fade-in' : 'opacity-0'}`}
                style={{ textWrap: 'balance' as React.CSSProperties['textWrap'] }}
              >
                {fortune.fortune_text}
              </div>
              {already && (
                <div className="mt-3 text-[11px] text-muted">오늘은 이미 한 번 뽑았어요. 내일 다시!</div>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => shareKakao(fortune)}
                  disabled={sharing}
                  className="flex-1 px-3 py-2 text-[13px] font-bold tracking-wide cursor-pointer border-none bg-[#FEE500] text-[#191919] hover:bg-[#fcd900] disabled:opacity-60 flex items-center justify-center gap-1.5"
                  title="카카오톡으로 공유"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.84 5.32 4.62 6.78l-1.05 3.83c-.1.36.27.65.59.46l4.51-2.97c.43.04.87.07 1.33.07 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
                  </svg>
                  카톡 공유
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 px-3 py-2 text-[13px] font-bold tracking-wide cursor-pointer border-none bg-emerald-500 text-white hover:bg-emerald-600"
                >
                  확인
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  // 뽑은 후엔 정적 회색 톤 — 애니메이션 0. 클릭은 가능 (다시 누르면 같은 운세 모달).
  const buttonCls = drawnToday
    ? 'relative w-full px-2 py-2 text-[12px] font-bold text-muted bg-[#f3f4f6] border border-[#e5e7eb] cursor-pointer hover:bg-[#e5e7eb] flex items-center justify-center gap-1.5'
    : 'fortune-aurora group relative w-full px-2 py-2 text-[12px] font-bold text-white border-none cursor-pointer overflow-hidden flex items-center justify-center gap-1.5';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={buttonCls}
        title={drawnToday ? '오늘 운세 (다시 보기)' : '오늘의 포춘쿠키 — 1일 1회'}
      >
        <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap drop-shadow-sm">
          <CookieIcon size={18} />
          <span>{label}</span>
        </span>
        {!drawnToday && <span aria-hidden className="fortune-aurora-shine" />}
      </button>
      {modal}
    </>
  );
}
