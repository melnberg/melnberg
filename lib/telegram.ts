// 텔레그램 봇으로 채널에 메시지 푸시.
// env: TELEGRAM_BOT_TOKEN (BotFather 발급), TELEGRAM_CHAT_ID (@channel_username 또는 -100... 숫자 ID)

const API_BASE = 'https://api.telegram.org';

export type TelegramSendResult = { ok: true; message_id: number } | { ok: false; error: string };

export async function sendTelegramMessage(text: string, opts?: { parseMode?: 'HTML' | 'MarkdownV2'; disablePreview?: boolean }): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 환경변수 없음' };
  }
  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: opts?.parseMode ?? 'HTML',
        disable_web_page_preview: opts?.disablePreview ?? false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.description ?? `HTTP ${res.status}` };
    }
    return { ok: true, message_id: json.result?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

// HTML escape — 텔레그램 HTML 모드에 안전
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 미리보기용 본문 자르기
export function preview(s: string | null | undefined, max = 200): string {
  if (!s) return '';
  const t = s.trim().replace(/\n+/g, ' ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}
