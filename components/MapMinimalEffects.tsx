'use client';

import { useEffect } from 'react';

// 모바일 미니멀 지도 모드 진입 시:
// 1) body 에 클래스 추가 → 외부 floating widgets (Telegram, Feedback) 숨김 가능
// 2) Kakao map relayout 트리거 — 오버레이 숨김 후 컨테이너 사이즈 변화 반영
export default function MapMinimalEffects() {
  useEffect(() => {
    document.body.classList.add('map-minimal-active');
    // 다중 시점에 resize 이벤트 발화 → Kakao map 자동 relayout
    const trigger = () => window.dispatchEvent(new Event('resize'));
    const t1 = setTimeout(trigger, 50);
    const t2 = setTimeout(trigger, 300);
    const t3 = setTimeout(trigger, 800);
    return () => {
      document.body.classList.remove('map-minimal-active');
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, []);
  return null;
}
