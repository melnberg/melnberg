// 스레드 전용 프로필 카드 (Threads/Twitter 스타일).
// theme_color 가 있으면 카드 상단에 60px 밴드. 아바타가 밴드와 겹쳐 좌측 상단.
// 본인이면 우측 상단에 "프로필 편집" 링크.
// 일기장 톤 — 차분, 작은 글자, 라운드 살짝.

import Link from 'next/link';
import type { ThreadProfile } from '@/lib/thread-profile';

type Props = {
  threadProfile: ThreadProfile | null;
  fallbackProfile: { display_name: string | null; avatar_url: string | null };
  threadCount: number;
  isOwner: boolean;
  /** 메타 표시용 가입일 (예: 첫 thread.created_at 또는 thread_profile.updated_at). null 이면 미표시 */
  joinedAtIso?: string | null;
};

// HEX 검증 — 무효한 값이면 null (PPT 톤 유지)
function safeHex(c: string | null | undefined): string | null {
  if (!c) return null;
  return /^#[0-9A-Fa-f]{6}$/.test(c) ? c : null;
}

export default function ThreadProfileCard({
  threadProfile,
  fallbackProfile,
  threadCount,
  isOwner,
  joinedAtIso,
}: Props) {
  const displayName =
    threadProfile?.display_name?.trim() ||
    fallbackProfile.display_name ||
    '회원';
  const avatarUrl = threadProfile?.avatar_url || fallbackProfile.avatar_url || null;
  const handle = threadProfile?.handle?.trim() || null;
  const bio = threadProfile?.bio?.trim() || null;
  const themeColor = safeHex(threadProfile?.theme_color ?? null);

  const joinedLabel = joinedAtIso
    ? new Date(joinedAtIso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long' })
    : null;

  return (
    <div className="w-full max-w-[640px] mx-auto bg-[#fff8ec] border-2 border-[#e8d9b8] rounded-3xl overflow-hidden mb-4 shadow-[0_4px_24px_rgba(120,90,50,0.06)]">
      {/* 상단 테마 밴드 — theme_color 있으면 그 색, 없으면 따뜻한 베이지 */}
      <div
        className="h-[60px] w-full"
        style={{ background: themeColor ?? '#e8d9b8' }}
        aria-hidden
      />
      <div className="px-5 pb-5">
        <div className="flex items-start justify-between gap-3 -mt-10">
          {/* 아바타 — 밴드와 겹침 */}
          <div className="flex-shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="w-20 h-20 rounded-full object-cover border-4 border-[#fff8ec] bg-[#fff8ec]"
              />
            ) : (
              <div className="w-20 h-20 rounded-full border-4 border-[#fff8ec] bg-[#f5e8cc] flex items-center justify-center text-[#5c4634] text-[24px] font-bold">
                {(displayName[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>
          {/* 우측 상단 편집 버튼 */}
          {isOwner && (
            <div className="mt-12">
              <Link
                href="/threads/profile"
                className="inline-block px-3 py-1.5 border-2 border-[#e8d9b8] bg-[#fff8ec] text-[#5c4634] text-[12px] font-bold no-underline hover:border-[#c89b6f] hover:text-[#5c4634] rounded-full transition-colors"
              >
                프로필 편집
              </Link>
            </div>
          )}
        </div>

        {/* 닉네임·핸들 */}
        <div className="mt-3">
          <div className="text-[17px] font-bold text-[#5c4634] leading-tight" style={{ fontFamily: 'serif' }}>{displayName}</div>
          {handle && (
            <div className="text-[12px] text-[#a07f5f] mt-0.5">
              {handle.startsWith('@') ? handle : `@${handle}`}
            </div>
          )}
        </div>

        {/* bio */}
        {bio && (
          <p className="mt-3 text-[13px] text-[#5c4634] whitespace-pre-wrap leading-loose">
            {bio}
          </p>
        )}

        {/* 메타 푸터 */}
        <div className="mt-3 flex items-center gap-3 text-[11px] text-[#8a6f55]">
          <span>글 <b className="text-[#5c4634] tabular-nums">{threadCount}</b>개</span>
          {joinedLabel && (
            <>
              <span aria-hidden>·</span>
              <span>{joinedLabel} 시작</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
