'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 실시간 매수·매물·호가 활동 토스트 — 15초 폴링.
// 첫 진입 시점 이후 발생한 활동만 토스트로 (기존 활동 무시).
// localStorage 에 마지막 본 ts 저장 → 새로고침해도 spam 방지.

type Offer = {
  offer_id: number; apt_id: number; apt_nm: string | null;
  buyer_name: string | null; price: number; kind: string; created_at: string;
};
type Sell = {
  apt_id: number; apt_nm: string | null; buyer_name: string | null; seller_name: string | null;
  price: number; occurred_at: string;
};

type ToastItem = {
  id: string;
  kind: 'offer' | 'snatch' | 'sell';
  title: string;
  body: string;
  ts: number;
};

const POLL_MS = 15000;
const SEEN_KEY = 'mlbg_live_activity_seen_v1';
const MAX_TOASTS = 3;
const TOAST_TTL_MS = 8000;

function getSeenTs(): number {
  if (typeof window === 'undefined') return Date.now();
  const raw = localStorage.getItem(SEEN_KEY);
  return raw ? Number(raw) : Date.now();
}
function setSeenTs(ts: number): void {
  try { localStorage.setItem(SEEN_KEY, String(ts)); } catch { /* quota */ }
}

export default function LiveActivityToaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let cancelled = false;
    let lastSeenTs = getSeenTs();

    async function poll() {
      try {
        const [oRes, sRes] = await Promise.all([
          fetch('/api/active-offers').then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch('/api/today-sells').then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (cancelled) return;
        const offers = ((oRes?.offers ?? []) as Offer[]);
        const sells = ((sRes?.sells ?? []) as Sell[]);
        const newToasts: ToastItem[] = [];

        for (const o of offers) {
          const ts = new Date(o.created_at).getTime();
          if (ts <= lastSeenTs) continue;
          const key = `o-${o.offer_id}`;
          if (seenIdsRef.current.has(key)) continue;
          seenIdsRef.current.add(key);
          if (o.kind === 'snatch') {
            newToasts.push({
              id: key, kind: 'snatch',
              title: `🪧 ${o.buyer_name ?? '익명'} 님 내놔 요청`,
              body: `${o.apt_nm ?? '단지'} — 무상 양도 요청`,
              ts,
            });
          } else {
            newToasts.push({
              id: key, kind: 'offer',
              title: `💰 ${o.buyer_name ?? '익명'} 님 매수 호가`,
              body: `${o.apt_nm ?? '단지'} — ${Number(o.price).toLocaleString()} mlbg`,
              ts,
            });
          }
        }
        for (const s of sells) {
          const ts = new Date(s.occurred_at).getTime();
          if (ts <= lastSeenTs) continue;
          const key = `s-${s.apt_id}-${ts}`;
          if (seenIdsRef.current.has(key)) continue;
          seenIdsRef.current.add(key);
          newToasts.push({
            id: key, kind: 'sell',
            title: `🏷️ 매매 체결`,
            body: `${s.apt_nm ?? '단지'} ${Number(s.price).toLocaleString()} mlbg — ${s.buyer_name ?? '익명'} 님 매수`,
            ts,
          });
        }

        if (newToasts.length > 0) {
          // 최신순 정렬, MAX 개만
          newToasts.sort((a, b) => b.ts - a.ts);
          const limited = newToasts.slice(0, MAX_TOASTS);
          setToasts((prev) => [...limited, ...prev].slice(0, MAX_TOASTS));
          // 마지막 본 ts 갱신
          lastSeenTs = Math.max(lastSeenTs, ...limited.map((t) => t.ts));
          setSeenTs(lastSeenTs);
          // 자동 dismiss
          for (const t of limited) {
            setTimeout(() => {
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            }, TOAST_TTL_MS);
          }
        }
      } catch { /* silent */ }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[150] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto w-[320px] bg-white border-l-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)] px-4 py-3 animate-slide-in-right ${
            t.kind === 'sell' ? 'border-[#dc2626]' : t.kind === 'snatch' ? 'border-cyan' : 'border-navy'
          }`}
        >
          <div className="text-[12px] font-bold text-navy mb-0.5">{t.title}</div>
          <div className="text-[11px] text-text leading-relaxed">{t.body}</div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
