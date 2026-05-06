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

// 포크(왼쪽 말굽 + 손잡이) + 숟가락(타원 보울 + 손잡이) — viewBox 24x24 안에 좌우 대칭 배치
export function RestaurantIcon({ className = 'w-[18px] h-[18px]' }: { className?: string }) {
  return (
    <svg {...baseProps} className={`${className} flex-shrink-0 inline-block align-[-0.15em]`}>
      {/* 포크: x=4~10 영역, 손잡이 x=7 */}
      <path d="M5 3v8a2 2 0 1 0 4 0V3" />
      <line x1="7" y1="11" x2="7" y2="21" />
      {/* 숟가락: x=14~20 영역, 손잡이 x=17 */}
      <ellipse cx="17" cy="7" rx="3" ry="4" />
      <line x1="17" y1="11" x2="17" y2="21" />
    </svg>
  );
}
