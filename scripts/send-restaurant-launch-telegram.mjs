// 1회성 — 맛집 추천 기능 오픈 텔레그램 발송
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
if (!token || !chatId) { console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 누락'); process.exit(1); }

const text = `🍴 <b>맛집 추천 기능 오픈</b>

본인이 아는 맛집을 직접 등록할 수 있어요.

· 등록 시 <b>+30 mlbg</b> 즉시 지급
· 1인 최대 5개
· 가게명 / 설명 / 추천메뉴 + 사진 (선택)
· 누구나 분양받기 가능 (100 mlbg, 일 수익 1)
· 좋아요 / 댓글 시 등록자에게 종 알림

좌측 사이드바 "🍴 맛집 추천" → "+ 맛집 등록"
👉 <a href="https://melnberg.vercel.app/restaurants/new">바로 등록하기</a>`;

const url = `https://api.telegram.org/bot${token}/sendMessage`;
const r = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  }),
});
const j = await r.json();
console.log(j.ok ? '✓ 발송 완료' : `✗ 실패: ${JSON.stringify(j)}`);
