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
    <div className="w-full max-w-[640px] mx-auto bg-white border border-border rounded-xl overflow-hidden mb-4">
      {/* 상단 테마 밴드 (theme_color 있을 때만). 없으면 살짝 회색 */}
      <div
        className="h-[60px] w-full"
        style={{ background: themeColor ?? '#f1f3f5' }}
        aria-hidden
      />
      <div className="px-4 pb-4">
        <div className="flex items-start justify-between gap-3 -mt-10">
          {/* 아바타 — 밴드와 겹침 */}
          <div className="flex-shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="w-20 h-20 rounded-full object-cover border-4 border-white bg-white"
              />
            ) : (
              <div className="w-20 h-20 rounded-full border-4 border-white bg-navy-soft flex items-center justify-center text-navy text-[24px] font-bold">
                {(displayName[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>
          {/* 우측 상단 편집 버튼 */}
          {isOwner && (
            <div className="mt-12">
              <Link
                href="/threads/profile"
                className="inline-block px-3 py-1.5 border border-border bg-white text-text text-[12px] font-bold no-underline hover:border-navy hover:text-navy rounded-full"
              >
                프로필 편집
              </Link>
            </div>
          )}
        </div>

        {/* 닉네임·핸들 */}
        <div className="mt-2">
          <div className="text-[16px] font-bold text-text leading-tight">{displayName}</div>
          {handle && (
            <div className="text-[12px] text-muted mt-0.5">
              {handle.startsWith('@') ? handle : `@${handle}`}
            </div>
          )}
        </div>

        {/* bio */}
        {bio && (
          <p className="mt-3 text-[13px] text-text whitespace-pre-wrap leading-relaxed">
            {bio}
          </p>
        )}

        {/* 메타 푸터 */}
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
          <span>글 <b className="text-text tabular-nums">{threadCount}</b>개</span>
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
