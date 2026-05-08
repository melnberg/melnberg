'use client';

// /threads 진입 시 에러 catch — server-side exception 으로 페이지 안 깨지게.
// digest 노출 + 재시도 버튼.

import Link from 'next/link';
import { useEffect } from 'react';

export default function ThreadsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 콘솔에 정확한 에러 — 사용자가 F12 로 열어서 stack 확인 가능
    console.error('[/threads] error:', error);
  }, [error]);

  return (
    <div className="bg-white min-h-screen flex flex-col items-center justify-center px-6 py-20 text-center">
      <p className="text-[14px] text-black font-bold mb-2">스레드를 불러오지 못했어</p>
      <p className="text-[12px] text-gray-500 mb-6">잠시 후 다시 시도하거나 홈으로 가.</p>
      {error.digest && (
        <p className="text-[10px] text-gray-400 mb-4 font-mono">digest: {error.digest}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="bg-black text-white px-4 py-2 rounded-full text-[13px] font-bold hover:bg-gray-800"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="border border-gray-300 text-black px-4 py-2 rounded-full text-[13px] font-bold no-underline hover:bg-gray-50"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
