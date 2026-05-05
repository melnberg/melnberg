// 글/댓글 INSERT 후 호출하는 텔레그램 알림 helper.
// fire-and-forget 으로 사용 권장 — 실패해도 작성 흐름 막지 않음.
// 봇 token 미설정·네트워크 오류 시 silent fail.

import type { MlbgAwardKind } from './mlbg-award';

export type TelegramNotifyKind = MlbgAwardKind | 'listing' | 'offer' | 'snatch';

export function notifyTelegram(kind: TelegramNotifyKind, refId: number): void {
  // 비동기 호출만 하고 결과 무시 — 작성 UX 차단 방지
  fetch('/api/telegram/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, refId }),
  }).catch(() => { /* silent */ });
}
