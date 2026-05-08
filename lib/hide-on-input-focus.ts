// 글 쓰기·댓글창 등 input/textarea focus 시 floating 위젯 자동 숨김.
// 키보드 올라온 상태에서 등록 버튼·입력창 가리지 않게.

import { useEffect, useState } from 'react';

export function useHideOnInputFocus(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const isInput = (el: EventTarget | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const onFocusIn = (e: FocusEvent) => { if (isInput(e.target)) setVisible(false); };
    const onFocusOut = (e: FocusEvent) => {
      // related target 도 input 이면 그대로 유지 (다른 입력창 이동)
      if (isInput(e.relatedTarget)) return;
      // 짧은 지연 후 활성 element 검사 — 입력창 간 이동 시 깜빡임 방지
      setTimeout(() => {
        if (!isInput(document.activeElement)) setVisible(true);
      }, 50);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  return visible;
}
