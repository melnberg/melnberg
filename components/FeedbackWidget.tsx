'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const TIP_DISMISSED_KEY = 'mlbg_feedback_tip_dismissed_v1';

export default function FeedbackWidget() {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 첫 방문자는 말풍선 한 번 띄움
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (!localStorage.getItem(TIP_DISMISSED_KEY)) setTipOpen(true);
    } catch {}
  }, []);

  function dismissTip() {
    setTipOpen(false);
    try { localStorage.setItem(TIP_DISMISSED_KEY, '1'); } catch {}
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
      setTimeout(() => { setOpen(false); setDone(false); }, 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="floating-widget fixed bottom-5 right-5 z-50 flex items-end gap-2">
      {open ? (
        <div className="bg-white border border-border shadow-[0_8px_24px_rgba(0,0,0,0.18)] w-[320px] max-w-[calc(100vw-40px)]">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-navy text-white">
            <div className="text-[13px] font-bold">오류·불편사항 신고</div>
            <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-white/80 hover:text-white text-[16px] leading-none">✕</button>
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
      ) : (
        <>
          {tipOpen && (
            <div className="relative bg-[#1a1d22] text-white text-[12px] font-medium px-3 py-2 pr-7 shadow-[0_4px_12px_rgba(0,0,0,0.2)]" style={{ borderRadius: '6px' }}>
              오류·불편사항이 있다면 알려주세요
              <button type="button" onClick={dismissTip} aria-label="닫기" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-[12px] leading-none">✕</button>
              {/* 화살표 */}
              <div className="absolute -right-1.5 bottom-3 w-3 h-3 bg-[#1a1d22] rotate-45" />
            </div>
          )}
          <button
            type="button"
            onClick={() => { setOpen(true); dismissTip(); }}
            aria-label="오류·불편사항 신고"
            className="w-12 h-12 rounded-full bg-cyan text-white shadow-[0_4px_16px_rgba(0,176,240,0.4)] hover:bg-cyan-dark flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
