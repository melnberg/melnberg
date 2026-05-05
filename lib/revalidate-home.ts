// 홈 피드 캐시 무효화 trigger. 글/댓글/매물 등 mutation 직후 호출.
// fire-and-forget — 응답 기다리지 않음, 실패해도 무시.
export function revalidateHome(): void {
  if (typeof window === 'undefined') return;
  fetch('/api/revalidate-home', { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => {});
}
