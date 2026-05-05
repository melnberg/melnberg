'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Status = 'loading' | 'available' | 'done' | 'guest';
type Grade = 'miss' | 'small' | 'big' | 'jackpot';

type SpinResult = {
  earned: number;       // 기본 + streak 보너스
  spinAmount: number;   // 룰렛 금액
  grade: Grade;
  streak: number;
  bonusLabel: string | null;
};

const GRADE_STYLE: Record<Grade, { bg: string; ring: string; emoji: string; label: string; flash: boolean }> = {
  miss: { bg: 'bg-[#f3f4f6]', ring: 'border-[#d1d5db]', emoji: '🎯', label: '꽝!', flash: false },
  small: { bg: 'bg-cyan/15', ring: 'border-cyan', emoji: '✨', label: '소액 당첨', flash: false },
  big: { bg: 'bg-[#fef3c7]', ring: 'border-[#f59e0b]', emoji: '💎', label: '대박!', flash: true },
  jackpot: { bg: 'bg-gradient-to-br from-[#fbbf24] via-[#f59e0b] to-[#dc2626]', ring: 'border-[#dc2626]', emoji: '🎰', label: '잭팟!!!', flash: true },
};

export default function CheckinButton() {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState<Status>('loading');
  const [streak, setStreak] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setStatus('guest'); return; }
      const { data } = await supabase
        .from('profiles')
        .select('last_checkin_date, checkin_streak')
        .eq('id', user.id)
        .maybeSingle()
        .then((r) => r, () => ({ data: null }));
      if (cancelled) return;
      const row = (data ?? {}) as { last_checkin_date?: string | null; checkin_streak?: number | null };
      const kstToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
      const last = row.last_checkin_date ?? null;
      setStreak(row.checkin_streak ?? 0);
      setStatus(last === kstToday ? 'done' : 'available');
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  async function handleClick() {
    if (busy || status !== 'available') return;
    setBusy(true);
    const { data, error } = await supabase.rpc('daily_checkin');
    setBusy(false);
    if (error) { alert(error.message); return; }
    type Row = {
      out_success: boolean;
      out_earned: number;
      out_streak: number;
      out_bonus_label: string | null;
      out_spin_amount?: number;
      out_spin_grade?: Grade;
      out_message: string | null;
    };
    const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '출석 실패'); return; }
    setStreak(row.out_streak);
    setStatus('done');
    setRevealed(false);
    setResult({
      earned: Number(row.out_earned),
      spinAmount: Number(row.out_spin_amount ?? 0),
      grade: (row.out_spin_grade ?? 'miss') as Grade,
      streak: row.out_streak,
      bonusLabel: row.out_bonus_label,
    });
    // 2초 spin 애니메이션 후 reveal
    setTimeout(() => setRevealed(true), 1800);
  }

  const isDone = status === 'done';

  if (status === 'guest' || status === 'loading') return null;

  const modal = result && mounted ? createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`relative w-[320px] p-7 border-4 shadow-[0_8px_40px_rgba(0,0,0,0.3)] ${revealed ? GRADE_STYLE[result.grade].bg : 'bg-white'} ${revealed ? GRADE_STYLE[result.grade].ring : 'border-navy'} ${revealed && GRADE_STYLE[result.grade].flash ? 'animate-pulse-glow' : ''}`}>
        <div className="text-center">
          <div className="text-[12px] font-bold tracking-widest uppercase text-muted mb-2">럭키 룰렛</div>
          {!revealed ? (
            <>
              <div className="text-[60px] mb-2 inline-block animate-spin-fast">🎰</div>
              <div className="text-[14px] font-bold text-text">결과 확인 중...</div>
            </>
          ) : (
            <>
              <div className="text-[60px] mb-2">{GRADE_STYLE[result.grade].emoji}</div>
              <div className={`text-[20px] font-black tracking-tight mb-1 ${result.grade === 'jackpot' ? 'text-white' : result.grade === 'big' ? 'text-[#92400e]' : result.grade === 'small' ? 'text-navy' : 'text-text'}`}>
                {GRADE_STYLE[result.grade].label}
              </div>
              <div className={`text-[32px] font-black tabular-nums ${result.grade === 'jackpot' ? 'text-white' : 'text-navy'}`}>
                +{result.spinAmount} mlbg
              </div>
              <div className={`text-[11px] mt-2 ${result.grade === 'jackpot' ? 'text-white/80' : 'text-muted'}`}>
                기본 {result.earned} mlbg · {result.streak}일 연속
              </div>
              {result.bonusLabel && (
                <div className={`mt-2 text-[12px] font-bold ${result.grade === 'jackpot' ? 'text-white' : 'text-cyan'}`}>
                  🎉 {result.bonusLabel}
                </div>
              )}
              <button
                type="button"
                onClick={() => { setResult(null); router.refresh(); }}
                className={`mt-5 w-full px-4 py-2 text-[13px] font-bold tracking-wide cursor-pointer border-none ${result.grade === 'jackpot' ? 'bg-white text-[#dc2626] hover:bg-white/90' : 'bg-navy text-white hover:bg-navy-dark'}`}
              >
                확인
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isDone || busy}
        className={`w-full px-3 py-1.5 text-[11px] font-bold flex items-center justify-between gap-2 border transition-colors ${
          isDone
            ? 'bg-bg/60 border-border text-muted cursor-default'
            : 'bg-cyan/10 border-cyan/40 text-navy hover:bg-cyan hover:text-white cursor-pointer'
        }`}
        title={isDone ? '오늘 출석 완료' : '클릭해서 +0.5 mlbg + 럭키 룰렛'}
      >
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {isDone ? <polyline points="20 6 9 17 4 12" /> : <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>}
          </svg>
          <span>{isDone ? '오늘 출석 완료' : '출석 + 룰렛 🎰'}</span>
        </span>
        {streak > 0 && (
          <span className={`text-[10px] tabular-nums ${isDone ? 'text-muted' : 'text-cyan font-bold'}`}>
            {streak}일 연속
          </span>
        )}
      </button>
      {modal}
    </>
  );
}
