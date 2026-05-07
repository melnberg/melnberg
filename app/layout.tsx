import type { Metadata, Viewport } from 'next';
import './globals.css';
import PWAInstall from '@/components/PWAInstall';

export const metadata: Metadata = {
  title: '멜른버그',
  description: '멜른버그 — 상담과 멤버십',
  // iOS Safari 가 PWA 로 인식하도록 — 풀스크린 + 상단 상태바 톤 + 앱 이름
  appleWebApp: {
    capable: true,
    title: '멜른버그',
    statusBarStyle: 'default',
  },
};

// PWA 풀스크린 + 상단 컬러
export const viewport: Viewport = {
  themeColor: '#002060',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* DNS / TCP / TLS 미리 워밍업 — 카카오 지도 SDK + 폰트 첫 fetch latency 단축 */}
        <link rel="preconnect" href="https://dapi.kakao.com" crossOrigin="" />
        <link rel="preconnect" href="https://t1.daumcdn.net" crossOrigin="" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="dns-prefetch" href="https://dapi.kakao.com" />
        <link rel="dns-prefetch" href="https://t1.daumcdn.net" />
        <link
          rel="stylesheet"
          crossOrigin=""
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* iOS 홈 화면 추가 시 아이콘 — 180×180 PNG 우선, SVG fallback */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body>
        {children}
        <PWAInstall />
      </body>
    </html>
  );
}
