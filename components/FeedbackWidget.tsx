'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function FeedbackWidget() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 모달 열릴 때 history dummy state push → 뒤로가기 = 모달만 닫힘 (페이지 종료 X)
  useEffect(() => {
    if (!open) return;
    const dummyState = { __feedback: 1 };
    window.history.pushState(dummyState, '', window.location.href);
    const onPop = () => setOpen(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);


  // X 버튼 / submit 성공 시 닫기 — history dummy 도 같이 pop
  function closeModal() {
    if (typeof window !== 'undefined' && window.history.state && (window.history.state as { __feedback?: number }).__feedback === 1) {
      window.history.back(); // popstate → setOpen(false)
    } else {
      setOpen(false);
    }
  }

  async function submit() {
    if (busy) return;
    const text = message.trim();
    if (!text) { setErr('내용을 입력해주세요.'); return; }
    if (text.length > 2000) { setErr('2000자 이내로 입력해주세요.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let displayName: string | null = null;
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        displayName = (profile as { display_name?: string | null } | null)?.display_name ?? null;
      }
      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id ?? null,
        email: user?.email ?? null,
        display_name: displayName,
        message: text,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
        page_url: typeof window !== 'undefined' ? window.location.href.slice(0, 500) : null,
      });
      if (error) { setErr(`전송 실패: ${error.message}`); return; }
      setDone(true);
      setMessage('');
      setTimeout(() => { closeModal(); setDone(false); }, 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="floating-widget fixed top-2 right-2 z-50 flex flex-col items-end gap-2"
    >
      {/* 아이콘 — 항상 노출. open 일 때도 그대로 (모달이 그 아래 펼쳐짐). */}
      <button
        type="button"
        onClick={() => (open ? closeModal() : setOpen(true))}
        aria-label="오류·불편사항 신고"
        className="w-9 h-9 rounded-full bg-white/70 backdrop-blur-sm border border-border text-navy hover:bg-white hover:border-navy flex items-center justify-center transition-colors flex-shrink-0"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      {open && (
        <div className="bg-white border border-border shadow-[0_8px_24px_rgba(0,0,0,0.18)] w-[320px] max-w-[calc(100vw-40px)]">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-navy text-white">
            <div className="text-[13px] font-bold">오류·불편사항 신고</div>
            <button type="button" onClick={closeModal} aria-label="닫기" className="text-white/80 hover:text-white text-[16px] leading-none">✕</button>
          </div>
          <div className="px-4 py-3">
            {done ? (
              <div className="text-[13px] text-cyan font-bold py-6 text-center">감사합니다. 빠르게 확인하겠습니다.</div>
            ) : (
              <>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="버그·오류·개선 제안 등 자유롭게 적어주세요. (현재 페이지 URL은 자동으로 함께 전송됩니다)"
                  className="w-full border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-navy resize-none"
                  autoFocus
                />
                {err && <div className="text-[11px] text-red-700 mt-1">{err}</div>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-muted">{message.length}/2000</span>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={busy || !message.trim()}
                    className="bg-navy text-white px-4 py-1.5 text-[12px] font-bold tracking-wide cursor-pointer hover:bg-navy-dark disabled:opacity-40 border-none"
                  >
                    {busy ? '전송 중...' : '보내기'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
