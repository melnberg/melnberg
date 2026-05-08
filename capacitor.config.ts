import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor 설정 — 멜른버그 안드로이드 앱
// 하이브리드 라이브 모드: WebView 가 melnberg.vercel.app 직접 로드.
// 사이트 업데이트 시 앱 업데이트 불필요. 인터넷 없으면 capacitor-shell/index.html 폴백.

const config: CapacitorConfig = {
  appId: 'com.melnberg.app',
  appName: '멜른버그',
  webDir: 'capacitor-shell',
  server: {
    url: 'https://melnberg.vercel.app',
    cleartext: false,
    // OAuth 인앱 처리 — 외부 브라우저(Chrome) 안 띄움. WebView 안에서 카카오·구글 등 로그인.
    // 등록 안 된 도메인 click 시 Capacitor 가 시스템 브라우저로 던지는 기본 동작 회피.
    allowNavigation: [
      'kauth.kakao.com',
      'accounts.kakao.com',
      'logins.daum.net',
      '*.kakao.com',
      'accounts.google.com',
      'oauth2.googleapis.com',
      '*.googleusercontent.com',
      '*.supabase.co',
      '*.supabase.in',
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#002060',
  },
};

export default config;
