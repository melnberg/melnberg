// 사이드바/페이지 헤더/카드 공용 카테고리 아이콘
// className 으로 크기 지정 (기본 18px, 헤더는 24~28px)

const baseProps = {
  fill: 'none' as const,
  stroke: 'currentColor' as const,
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export function KidsIcon({ className = 'w-[18px] h-[18px]' }: { className?: string }) {
  return (
    <svg {...baseProps} className={`${className} flex-shrink-0 inline-block align-[-0.15em]`}>
      <circle cx="12" cy="13" r="7" />
      <circle cx="9.5" cy="12.5" r="0.7" fill="currentColor" />
      <circle cx="14.5" cy="12.5" r="0.7" fill="currentColor" />
      <path d="M9 15.5 Q 12 18 15 15.5" />
    </svg>
  );
}

// 포크(왼쪽 말굽 + 손잡이) + 숟가락(타원 보울 + 손잡이) — 원래 사이드바 톤 유지하되 보울 완전히 그림
export function RestaurantIcon({ className = 'w-[18px] h-[18px]' }: { className?: string }) {
  return (
    <svg {...baseProps} className={`${className} flex-shrink-0 inline-block align-[-0.15em]`}>
      <path d="M7 3v8a2 2 0 1 0 4 0V3" />
      <line x1="9" y1="11" x2="9" y2="21" />
      <ellipse cx="16" cy="7" rx="2.5" ry="4" />
      <line x1="16" y1="11" x2="16" y2="21" />
    </svg>
  );
}
