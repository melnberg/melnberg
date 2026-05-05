// 우측 하단 a — 텔레그램 채널. 동그라미 (icon-only).
const TELEGRAM_URL = 'https://t.me/melnberg';

export default function TelegramFloatingLink() {
  return (
    <a
      href={TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="텔레그램 채널 구독"
      title="텔레그램 채널 구독 — 새 글·댓글 자동 알림"
      className="floating-widget fixed bottom-[136px] right-5 z-40 w-12 h-12 rounded-full bg-[#229ED9] hover:bg-[#1c87b8] text-white shadow-[0_4px_12px_rgba(34,158,217,0.45)] no-underline transition-colors flex items-center justify-center"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21.05 3.39 2.81 10.41c-1.24.5-1.23 1.2-.22 1.51l4.68 1.46 1.81 5.55c.21.59.11.83.74.83.49 0 .7-.22.97-.49.17-.17 1.18-1.15 2.31-2.25l4.86 3.59c.9.49 1.54.24 1.76-.83l3.19-15.05c.33-1.31-.5-1.9-1.86-1.34zM5.99 12.12l9.7-6.13c.45-.27.86-.13.52.18l-7.7 6.96-.3 3.2-1.42-4.3z"/>
      </svg>
    </a>
  );
}
