'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Provider = 'kakao' | 'google' | 'naver';

export default function OAuthButtons({ next = '/' }: { next?: string }) {
  const supabase = createClient();
  const [busy, setBusy] = useState<Provider | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function startSupabase(provider: 'kakao' | 'google') {
    if (busy) return;
    setBusy(provider);
    setErr(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/complete-signup?next=' + next)}`,
      },
    });
    if (error) {
      setBusy(null);
      setErr(error.message);
    }
  }

  function startNaver() {
    if (busy) return;
    setBusy('naver');
    // 네이버는 Supabase 미지원 → 우리 라우트로 이동, 거기서 네이버 authorize 로 redirect
    window.location.href = `/api/auth/naver/start?next=${encodeURIComponent(next)}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => startSupabase('kakao')}
        disabled={!!busy}
        className="w-full bg-[#FEE500] text-[#191919] py-3 text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-[#FDD835] disabled:opacity-60 border-none cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.79 1.84 5.24 4.6 6.66l-1.18 4.31c-.1.36.29.65.6.45L11.32 19c.22.02.45.03.68.03 5.52 0 10-3.48 10-7.8C22 6.48 17.52 3 12 3z"/></svg>
        {busy === 'kakao' ? '카카오 연결 중...' : '카카오로 시작하기'}
      </button>
      {/* 네이버 — 검수 통과 전이라 등록된 멤버만 로그인 가능. 일반 사용자에게 혼란.
          승인 후 다시 활성화. 함수 startNaver 와 /api/auth/naver/* 는 코드 유지. */}
      {false && (
        <button
          type="button"
          onClick={startNaver}
          disabled={!!busy}
          className="w-full bg-[#03C75A] text-white py-3 text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-[#02b350] disabled:opacity-60 border-none cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 8.85L6.18 3.99H3.5v8.02h3v-4.86l3.32 4.86H12.5V3.99h-3z"/></svg>
          {busy === 'naver' ? '네이버 연결 중...' : '네이버로 시작하기'}
        </button>
      )}
      <button
        type="button"
        onClick={() => startSupabase('google')}
        disabled={!!busy}
        className="w-full bg-white border border-border text-text py-3 text-[13px] font-bold flex items-center justify-center gap-2 hover:border-navy disabled:opacity-60 cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        {busy === 'google' ? '구글 연결 중...' : '구글로 시작하기'}
      </button>
      {err && <div className="text-[11px] text-red-700 text-center">{err}</div>}
    </div>
  );
}
