import type { MetadataRoute } from 'next';

// PWA manifest — 사용자가 "홈 화면에 추가" 시 풀스크린 앱처럼 동작.
// Next.js 가 /manifest.webmanifest 로 자동 노출하고 <link rel="manifest"> 도 자동 삽입.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '멜른버그',
    short_name: '멜른버그',
    description: '멜른버그 — 부동산·맛집·육아 장소 커뮤니티',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#002060',
    lang: 'ko-KR',
    icons: [
      // SVG — 모든 사이즈 자동 스케일 (모던 브라우저)
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      // PNG fallback 은 추후 192/512 추가 권장 (Android Chrome 설치 배너 안정성 ↑)
    ],
  };
}
