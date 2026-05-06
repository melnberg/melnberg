// 멜른버그 PWA 서비스 워커 — 최소 오프라인 폴백 + 정적 자산 캐싱.
// 동적 데이터 (피드, 핀, 결제 등) 는 캐싱 X — Supabase/API 호출은 항상 네트워크.

const CACHE = 'mlbg-static-v2';
const PRECACHE = ['/', '/logo.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => null)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API · Supabase · 외부 (카카오·토스 등) — 항상 네트워크 (캐싱 X)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.') ||
    url.hostname.includes('kakao') ||
    url.hostname.includes('toss') ||
    url.hostname.includes('tosspayments') ||
    url.hostname.includes('telegram')
  ) return;

  // navigation (HTML) — network-first, 실패 시 / 캐시 폴백
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/').then((r) => r ?? new Response('오프라인', { status: 503 }))),
    );
    return;
  }

  // 정적 (svg/png/css/js) — cache-first, miss 면 네트워크 → 캐시 채움
  if (url.origin === self.location.origin && /\.(svg|png|jpg|webp|css|js|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      })),
    );
  }
});
