'use client';

import { useEffect } from 'react';

// 페이지 마운트 시 한 번 /api/auction-cleanup 을 fire-and-forget 호출.
// Vercel cron 이 매분 돌지만 (Hobby plan 미지원 시) 사용자 방문 트리거로 fallback.
// 응답 무시 — 단순히 만료 경매 처리 + 알림 발송 트리거.
export default function AuctionCleanupTrigger() {
  useEffect(() => {
    fetch('/api/auction-cleanup', { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => {});
  }, []);
  return null;
}
