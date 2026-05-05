'use client';

import { useEffect, useState } from 'react';

// HH:MM:SS 형식 카운트다운. 매 초 갱신. 종료 시 '00:00:00'.
export default function Countdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const [remainingMs, setRemainingMs] = useState(() => new Date(endsAt).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setRemainingMs(new Date(endsAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (remainingMs <= 0) return <span className={className}>00:00:00</span>;
  const sec = Math.floor(remainingMs / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (
    <span className={`tabular-nums ${className ?? ''}`}>
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}
