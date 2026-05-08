'use client';

// ThreadComposer + ThreadTabs 묶음.
// composer 가 작성 → 자식 state 에 즉시 prepend → router.refresh 지연 없이 화면 반영.
// (build cache bust marker)

import { useState } from 'react';
import ThreadComposer from './ThreadComposer';
import ThreadTabs from './ThreadTabs';
import type { Thread } from './ThreadList';

type Props = {
  initialThreads: Thread[];
  initialReplies: Thread[];
  currentUserId: string | null;
  /** composer 표시 여부 (본인 페이지면 true). 기본 false. */
  canPost?: boolean;
  /** 작성한 사용자 author 정보 (낙관적 카드용 — 닉네임·아바타). */
  currentAuthor?: Thread['author'] | null;
  showAuthor?: boolean;
};

export default function ThreadFeed({
  initialThreads,
  initialReplies,
  currentUserId,
  canPost = false,
  currentAuthor = null,
  showAuthor = false,
}: Props) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  // replies 는 본인이 단 답글 모음이므로 새 thread 작성과 무관. 그대로 유지.
  const [replies] = useState<Thread[]>(initialReplies);

  function handlePosted(t: Thread) {
    // 새 글이면 threads 에 prepend, 답글이면 (현재 페이지에선 답글 composer 가 없는 컨텍스트) 패스.
    if (t.parent_id === null) {
      setThreads((cur) => [t, ...cur]);
    }
  }

  return (
    <>
      {canPost && (
        <ThreadComposer
          onPosted={handlePosted}
          currentAuthor={currentAuthor}
        />
      )}
      <ThreadTabs
        threads={threads}
        replies={replies}
        currentUserId={currentUserId}
        showAuthor={showAuthor}
      />
    </>
  );
}
