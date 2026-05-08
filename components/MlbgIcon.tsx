// 멜른버그 화폐 — 비트코인 ₿ 모티브에서 B → M 으로 변형. 골드/오렌지 그라디언트 코인.
// 사이드바 잔액 옆 + 어디든 인라인으로 사용.

export default function MlbgIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={`inline-block align-middle ${className}`}
    >
      <defs>
        <linearGradient id="mlbgCoinG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD66B" />
          <stop offset="55%" stopColor="#F7931A" />
          <stop offset="100%" stopColor="#C76900" />
        </linearGradient>
        <linearGradient id="mlbgCoinShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#mlbgCoinG)" />
      <circle cx="16" cy="16" r="15" fill="url(#mlbgCoinShine)" />
      <circle cx="16" cy="16" r="14" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="0.6" />
      {/* M 글자 — Bitcoin ₿ 자리. 위아래 stroke 가 살짝 빠져나오는 비트 컨벤션 살림. */}
      <g fill="#FFFFFF">
        {/* 위 stroke (₿ 의 윗 꼬리) */}
        <rect x="11" y="5.5" width="1.7" height="3" rx="0.4" />
        <rect x="19.3" y="5.5" width="1.7" height="3" rx="0.4" />
        {/* 아래 stroke */}
        <rect x="11" y="23.5" width="1.7" height="3" rx="0.4" />
        <rect x="19.3" y="23.5" width="1.7" height="3" rx="0.4" />
      </g>
      {/* M 본체 — bold serif 스타일 */}
      <text
        x="16"
        y="22.2"
        textAnchor="middle"
        fontFamily="'Inter', 'Pretendard', system-ui, sans-serif"
        fontSize="17"
        fontWeight="900"
        fill="#FFFFFF"
        style={{ letterSpacing: '-0.5px' }}
      >
        M
      </text>
    </svg>
  );
}
