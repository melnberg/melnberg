// Vercel cron 라우트 공통 래퍼 — 실패 시 텔레그램 알림.
//
// 배경: 2026-05-15 시설 배당 cron 이 check 제약 위반으로 매일 조용히 500 났는데
// 아무도 모르고 며칠 흘렀음. cron 핸들러를 withCron 으로 감싸면
// 예외 throw / 5xx 응답 둘 다 잡아서 텔레그램으로 쏨.
//
// 사용: export const GET = withCron('auto-facility-income', handler);
// 핸들러 내부(인증·로직)는 그대로 — 래퍼는 결과만 들여다봄.

import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, escapeHtml } from '@/lib/telegram';

async function alertCronFailure(name: string, detail: string) {
  const kst = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  const text = `[🚨 cron 실패] ${escapeHtml(name)}\n${escapeHtml(kst)}\n${escapeHtml(detail)}`;
  await sendTelegramMessage(text, { parseMode: 'HTML', disablePreview: true });
}

export function withCron(
  name: string,
  handler: (req: NextRequest) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      const res = await handler(req);
      // 401(인증 실패)은 알림 안 함 — Vercel cron 은 CRON_SECRET 자동 첨부라
      // 401 은 외부의 잘못된 호출. 5xx 만 진짜 실패로 본다.
      if (res.status >= 500) {
        const body = await res.clone().text().catch(() => '');
        await alertCronFailure(name, `HTTP ${res.status} ${body}`.trim());
      }
      return res;
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      await alertCronFailure(name, msg);
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
    }
  };
}
