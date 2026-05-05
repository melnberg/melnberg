'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Status = 'loading' | 'available' | 'done' | 'guest';

export default function CheckinButton() {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState<Status>('loading');
  const [streak, setStreak] = useState<number>(0);
  const [busy, setBusy] = useState(false);

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
      // KST 오늘 날짜 (YYYY-MM-DD)
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
    const row = (Array.isArray(data) ? data[0] : data) as
      | { out_success: boolean; out_earned: number; out_streak: number; out_bonus_label: string | null; out_message: string | null }
      | undefined;
    if (!row?.out_success) { alert(row?.out_message ?? '출석 실패'); return; }
    setStreak(row.out_streak);
    setStatus('done');
    const bonusMsg = row.out_bonus_label ? `\n🎉 ${row.out_bonus_label}` : '';
    alert(`출석 완료 +${row.out_earned} mlbg (${row.out_streak}일 연속)${bonusMsg}`);
    router.refresh();
  }

  if (status === 'guest' || status === 'loading') return null;

  const isDone = status === 'done';
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDone || busy}
      className={`w-full px-3 py-1.5 text-[11px] font-bold flex items-center justify-between gap-2 border transition-colors ${
        isDone
          ? 'bg-bg/60 border-border text-muted cursor-default'
          : 'bg-cyan/10 border-cyan/40 text-navy hover:bg-cyan hover:text-white cursor-pointer'
      }`}
      title={isDone ? '오늘 출석 완료' : '클릭해서 +0.5 mlbg, 7/30/100/365일 연속 보너스'}
    >
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {isDone ? <polyline points="20 6 9 17 4 12" /> : <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>}
        </svg>
        <span>{isDone ? '오늘 출석 완료' : '출석 체크'}</span>
      </span>
      {streak > 0 && (
        <span className={`text-[10px] tabular-nums ${isDone ? 'text-muted' : 'text-cyan font-bold'}`}>
          {streak}일 연속
        </span>
      )}
    </button>
  );
}
