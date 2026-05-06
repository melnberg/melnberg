// 텔레그램 채널 구독 — 우상단 작은 흑백 동그라미
const TELEGRAM_URL = 'https://t.me/melnberg';

export default function TelegramFloatingLink() {
  return (
    <a
      href={TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="텔레그램 채널 구독"
      title="텔레그램 채널 구독 — 새 글·댓글 자동 알림"
      className="floating-widget fixed top-2 right-[50px] lg:right-2 lg:top-[52px] z-40 w-9 h-9 rounded-full bg-white/70 backdrop-blur-sm border border-border text-navy hover:bg-white hover:border-navy no-underline transition-colors flex items-center justify-center"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    </a>
  );
}
