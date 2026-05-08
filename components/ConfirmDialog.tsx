'use client';

// 멜른버그 톤 confirm 다이얼로그 — useConfirm() Hook 이 띄움
// 직접 import 하지 말고 lib/use-confirm.tsx 의 useConfirm() 사용

import { useEffect, useRef } from 'react';

type Props = {
  title: string;
  body?: string;
  okLabel: string;
  cancelLabel: string;
  danger: boolean;
  onOk: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  title,
  body,
  okLabel,
  cancelLabel,
  danger,
  onOk,
  onCancel,
}: Props) {
  const okRef = useRef<HTMLButtonElement | null>(null);

  // 마운트 직후 확인 버튼에 포커스 — Enter 즉답 가능
  useEffect(() => {
    okRef.current?.focus();
  }, []);

  // body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-border w-full max-w-[400px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3">
          <h2
            id="confirm-dialog-title"
            className="text-lg font-bold text-navy leading-snug"
          >
            {title}
          </h2>
          {body ? (
            <p className="mt-2 text-sm text-text leading-relaxed whitespace-pre-line">
              {body}
            </p>
          ) : null}
        </div>
        <div className="px-6 pb-5 pt-2 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-full border border-border hover:bg-bg/60 text-text transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={okRef}
            type="button"
            onClick={onOk}
            className={
              danger
                ? 'px-4 py-2 text-sm rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors font-medium'
                : 'px-4 py-2 text-sm rounded-full bg-navy text-white hover:bg-navy-dark transition-colors font-medium'
            }
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
