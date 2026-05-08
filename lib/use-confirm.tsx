'use client';

// 멜른버그 톤 confirm 다이얼로그 — 브라우저 native confirm() 대체
// 사용법:
//   const confirm = useConfirm();
//   const ok = await confirm({ title: '삭제할까?', body: '되돌릴 수 없음.', okLabel: '삭제', danger: true });
//   if (!ok) return;
//
// Provider 는 app/layout.tsx 에서 children 을 wrap 한다.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

export type ConfirmOptions = {
  title: string;
  body?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Resolver = (ok: boolean) => void;

type ConfirmContextValue = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback<ConfirmContextValue>((options) => {
    return new Promise<boolean>((resolve) => {
      // 이전 미해결 호출이 있으면 false 로 닫고 새로 띄움
      if (resolverRef.current) {
        try { resolverRef.current(false); } catch {}
      }
      resolverRef.current = resolve;
      setOpts(options);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpts(null);
    if (r) r(ok);
  }, []);

  // ESC 로 취소
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts ? (
        <ConfirmDialog
          title={opts.title}
          body={opts.body}
          okLabel={opts.okLabel ?? '확인'}
          cancelLabel={opts.cancelLabel ?? '취소'}
          danger={!!opts.danger}
          onOk={() => close(true)}
          onCancel={() => close(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Provider 미마운트 — fallback (개발 중 안전망)
    return async (opts: ConfirmOptions) => {
      if (typeof window === 'undefined') return false;
      return window.confirm(opts.body ? `${opts.title}\n\n${opts.body}` : opts.title);
    };
  }
  return ctx;
}
