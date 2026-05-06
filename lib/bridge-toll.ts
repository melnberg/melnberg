// 다리 통행료 — 단지간 활동 이동 시 한강 횡단 감지 + 톨 결제.
// 사용 패턴:
//   const ok = await checkAndPayBridgeToll(apt.lat, apt.lng);
//   if (!ok) return; // 사용자가 거절했거나 잔액 부족
//   ... 활동 진행 ...

import { createClient } from './supabase/client';

export type BridgeTollResult = { ok: boolean; paid?: number; message?: string };

export async function checkAndPayBridgeToll(toLat: number | null | undefined, toLng: number | null | undefined): Promise<BridgeTollResult> {
  // 좌표 없으면 통과 (위치 갱신도 skip — 다음 활동 비교 기준 안 됨)
  if (toLat == null || toLng == null) return { ok: true };

  const supabase = createClient();

  // 1) 톨 필요 여부 확인
  const { data: checkData, error: checkErr } = await supabase.rpc('check_bridge_toll', {
    p_to_lat: toLat,
    p_to_lng: toLng,
  });
  if (checkErr) {
    // RPC 미적용 환경 — 그냥 통과
    return { ok: true };
  }
  const c = (Array.isArray(checkData) ? checkData[0] : checkData) as
    | { out_required: boolean; out_bridge_id: number | null; out_bridge_name: string | null; out_owner_name: string | null; out_amount: number }
    | undefined;

  if (!c?.out_required) {
    // 톨 없는 활동 — 위치만 갱신
    await supabase.rpc('pay_bridge_toll_and_update', {
      p_to_lat: toLat,
      p_to_lng: toLng,
      p_bridge_id: null,
    });
    return { ok: true };
  }

  // 2) 사용자 confirm
  const ok = window.confirm(
    `${c.out_amount} mlbg (소유주: ${c.out_owner_name})에게 ${c.out_bridge_name} 통행료를 내야 활동 가능합니다.\n\n납부하시겠습니까?`
  );
  if (!ok) return { ok: false, message: '통행료 미납' };

  // 3) 결제
  const { data: payData, error: payErr } = await supabase.rpc('pay_bridge_toll_and_update', {
    p_to_lat: toLat,
    p_to_lng: toLng,
    p_bridge_id: c.out_bridge_id,
  });
  if (payErr) return { ok: false, message: payErr.message };
  const p = (Array.isArray(payData) ? payData[0] : payData) as
    | { out_success: boolean; out_paid: number; out_message: string | null }
    | undefined;
  if (!p?.out_success) return { ok: false, message: p?.out_message ?? '결제 실패' };

  return { ok: true, paid: p.out_paid };
}
