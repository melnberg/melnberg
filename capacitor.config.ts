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
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#002060',
  },
};

export default config;
