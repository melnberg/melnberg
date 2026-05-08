// 스레드 전용 프로필 카드 — Meta Threads 앱 레이아웃.
// 좌측: 닉네임(큰 글씨) / 메타 (글 N · 시작일)
// 우측: 큰 원형 아바타 (84px)
// 사진·닉네임은 무조건 메인 profiles 의 것 사용. handle / bio / theme_color 모두 제거됨.
// border / rounded / shadow 모두 X — 페이지 자체 흰색 배경에 평면.

type Props = {
  profile: { display_name: string | null; avatar_url: string | null };
  threadCount: number;
  isOwner: boolean;
  /** 메타 표시용 가입일 (예: 첫 thread.created_at). null 이면 미표시 */
  joinedAtIso?: string | null;
};

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(1, Math.floor(ms / 86400000) + 1);
}

export default function ThreadProfileCard({
  profile,
  threadCount,
  isOwner: _isOwner,
  joinedAtIso,
}: Props) {
  // 사용 안 함 — 시그니처 호환용. lint 경고 회피.
  void _isOwner;
  const displayName = profile.display_name?.trim() || '회원';
  const avatarUrl = profile.avatar_url || null;
  const startDays = joinedAtIso ? daysSince(joinedAtIso) : null;

  return (
    <div className="w-full px-4 pt-5 pb-4">
      <div className="flex items-start justify-between gap-4">
        {/* 좌측 정보 */}
        <div className="flex-1 min-w-0">
          <div className="text-[24px] font-bold text-black leading-tight truncate">{displayName}</div>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-gray-500">
            <span>글 <b className="text-black tabular-nums">{threadCount}</b>개</span>
            {startDays !== null && (
              <>
                <span aria-hidden>·</span>
                <span>시작 <b className="text-black tabular-nums">{startDays}</b>일째</span>
              </>
            )}
          </div>
        </div>

        {/* 우측 아바타 */}
        <div className="relative flex-shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="w-[84px] h-[84px] rounded-full object-cover bg-gray-100"
            />
          ) : (
            <div className="w-[84px] h-[84px] rounded-full bg-gray-100 flex items-center justify-center text-black text-[28px] font-bold">
              {(displayName[0] ?? '?').toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
