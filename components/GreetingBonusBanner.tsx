'use client';

import { useEffect, useState } from 'react';

// 출퇴근 인사 보너스 시간대 (KST 07~09시 / 18~20시) 안내 배너.
// 이 시간엔:
//   - 본인 사진 첨부한 community 글 → +20 mlbg
//   - 인사 글 댓글 → +1.5 mlbg (×3 가중치)
// 사용자가 X 누르면 그 시간대 동안 숨김 (sessionStorage).

function getKstHour(): number {
  return parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }),
    10,
  );
}

function isGreetingTime(h: number): { active: boolean; period: '아침 출근' | '저녁 퇴근' | null } {
  if (h === 7 || h === 8) return { active: true, period: '아침 출근' };
  if (h === 18 || h === 19) return { active: true, period: '저녁 퇴근' };
  return { active: false, period: null };
}

export default function GreetingBonusBanner() {
  const [info, setInfo] = useState<{ active: boolean; period: '아침 출근' | '저녁 퇴근' | null }>({ active: false, period: null });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function check() {
      // 디버그 강제 노출: ?debug=greeting (또는 ?debug=greeting-evening)
      let next = { active: false, period: null as '아침 출근' | '저녁 퇴근' | null };
      try {
        const sp = new URLSearchParams(window.location.search);
        const dbg = sp.get('debug');
        if (dbg === 'greeting' || dbg === 'greeting-morning') {
          next = { active: true, period: '아침 출근' };
        } else if (dbg === 'greeting-evening') {
          next = { active: true, period: '저녁 퇴근' };
        } else {
          const h = getKstHour();
          next = isGreetingTime(h);
        }
      } catch {
        const h = getKstHour();
        next = isGreetingTime(h);
      }
      setInfo(next);
      // dismissed 키는 시간대 단위 — 다른 시간대 진입 시 다시 노출
      const dismissKey = `mlbg.greeting.dismiss.${next.period ?? ''}.${new Date().toISOString().slice(0, 10)}`;
      try {
        setDismissed(!!sessionStorage.getItem(dismissKey));
      } catch { /* SSR / blocked storage */ }
    }
    check();
    const id = setInterval(check, 60_000); // 1분마다 재확인
    return () => clearInterval(id);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      const dismissKey = `mlbg.greeting.dismiss.${info.period ?? ''}.${new Date().toISOString().slice(0, 10)}`;
      sessionStorage.setItem(dismissKey, '1');
    } catch { /* ignore */ }
  }

  if (!info.active || dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-[#fef3c7] via-[#fde68a] to-[#fef3c7] border-b-2 border-[#f59e0b] px-4 py-3 sticky top-0 z-50 shadow-sm">
      <div className="max-w-content mx-auto flex items-start gap-3">
        <div className="text-[20px] flex-shrink-0">{info.period === '아침 출근' ? '🌅' : '🌆'}</div>
        <div className="flex-1 min-w-0 text-[12px] text-[#78350f] leading-relaxed">
          <div className="font-bold text-[13px] mb-0.5">
            {info.period} 인증 보너스 시간! (KST {info.period === '아침 출근' ? '07~09시' : '18~20시'})
          </div>
          <ul className="space-y-0.5 ml-1">
            <li>📷 <b>본인 직접 찍은 사진 첨부 + 커뮤니티 글</b> → <b className="text-[#dc2626]">+20 mlbg</b></li>
            <li>💬 <b>인사 글에 댓글</b> → <b className="text-[#dc2626]">+1.5 mlbg</b> (평소 0.5 → ×3)</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="닫기"
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[#78350f] hover:text-[#dc2626] text-[18px] leading-none bg-transparent border-none cursor-pointer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
