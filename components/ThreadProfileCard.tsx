// 스레드 전용 프로필 카드 — Meta Threads 앱 레이아웃.
// 좌측: 닉네임(큰 글씨) / @handle / bio / 메타 (글 N · 시작일)
// 우측: 큰 원형 아바타 (84px) + 본인이면 우상단 작은 + 편집 버튼
// border / rounded / shadow 모두 X — 페이지 자체 흰색 배경에 평면.

import Link from 'next/link';
import type { ThreadProfile } from '@/lib/thread-profile';

type Props = {
  threadProfile: ThreadProfile | null;
  fallbackProfile: { display_name: string | null; avatar_url: string | null };
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
  const startDays = joinedAtIso ? daysSince(joinedAtIso) : null;

  return (
    <div className="w-full px-4 pt-5 pb-4">
      <div className="flex items-start justify-between gap-4">
        {/* 좌측 정보 */}
        <div className="flex-1 min-w-0">
          <div className="text-[24px] font-bold text-black leading-tight truncate">{displayName}</div>
          {handle && (
            <div className="text-[15px] text-gray-500 mt-0.5 truncate">
              {handle.startsWith('@') ? handle : `@${handle}`}
            </div>
          )}
          {bio && (
            <p className="mt-3 text-[14px] text-black whitespace-pre-wrap leading-relaxed break-words">
              {bio}
            </p>
          )}
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
          {isOwner && (
            <Link
              href="/threads/profile"
              aria-label="프로필 편집"
              title="프로필 편집"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-black text-white border-2 border-white flex items-center justify-center no-underline hover:bg-gray-800 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
