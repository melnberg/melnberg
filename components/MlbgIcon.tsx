// 멜른버그 화폐 — 검정 선화. 원 + M 글자만.
// 사이드바 잔액 옆 + 어디든 인라인으로 사용.

export default function MlbgIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      className={`inline-block align-middle ${className}`}
    >
      <circle cx="16" cy="16" r="14" strokeWidth="1.6" />
      <path d="M9 23 L9 9 L16 17 L23 9 L23 23" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
