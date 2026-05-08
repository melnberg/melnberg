'use client';

// Threads 식 4탭 — 스레드 / 답글 / 미디어 / 리포스트.
// 활성 탭 아래 굵은 검정 underline.
// 데이터는 prop 으로 받고, 클라가 탭 토글로 ThreadList 분기 렌더.

import { useState, useMemo } from 'react';
import ThreadList, { type Thread } from './ThreadList';

type TabKey = 'threads' | 'replies' | 'media' | 'reposts';

const IMG_RE = /https?:\/\/[^\s]+?\.(?:jpe?g|png|gif|webp)(?:\?[^\s]*)?/i;

type Props = {
  /** 본인의 글 (parent_id is null) */
  threads: Thread[];
  /** 본인의 답글 (parent_id is not null, author_id = userId) */
  replies: Thread[];
  currentUserId: string | null;
  /** showAuthor — 본인 페이지면 false (한 사람), 다른 사람 페이지면 false 도 동일. */
  showAuthor?: boolean;
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'threads', label: '스레드' },
  { key: 'replies', label: '답글' },
  { key: 'media', label: '미디어' },
  { key: 'reposts', label: '리포스트' },
];

export default function ThreadTabs({ threads, replies, currentUserId, showAuthor = false }: Props) {
  const [active, setActive] = useState<TabKey>('threads');

  const mediaThreads = useMemo(
    () => threads.filter((t) => IMG_RE.test(t.content)),
    [threads],
  );

  return (
    <div className="bg-white">
      {/* 탭 헤더 */}
      <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`flex-1 py-3 text-[14px] font-bold transition-colors ${
                isActive
                  ? 'text-black border-b-2 border-black'
                  : 'text-gray-400 border-b-2 border-transparent hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 탭 본문 */}
      <div>
        {active === 'threads' && (
          <ThreadList
            threads={threads}
            currentUserId={currentUserId}
            showAuthor={showAuthor}
            emptyText="아직 스레드가 없어."
          />
        )}
        {active === 'replies' && (
          <ThreadList
            threads={replies}
            currentUserId={currentUserId}
            showAuthor={showAuthor}
            emptyText="아직 단 답글이 없어."
          />
        )}
        {active === 'media' && (
          <ThreadList
            threads={mediaThreads}
            currentUserId={currentUserId}
            showAuthor={showAuthor}
            emptyText="이미지가 포함된 글이 없어."
          />
        )}
        {active === 'reposts' && (
          <p className="text-center py-12 text-gray-500 text-[13px]">
            아직 리포스트 기능이 없어.
          </p>
        )}
      </div>
    </div>
  );
}
