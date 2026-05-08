'use client';

// /t/[id] 단독 페이지용 — 답글 composer + 답글 ThreadList.
// composer 작성 시 자식 state 에 append 하여 즉시 반영.

import { useState } from 'react';
import ThreadComposer from './ThreadComposer';
import ThreadList, { type Thread } from './ThreadList';

type Props = {
  parentId: number;
  initialReplies: Thread[];
  currentUserId: string | null;
  currentAuthor?: Thread['author'] | null;
  /** 로그인 사용자만 composer 노출. */
  canPost: boolean;
};

export default function ThreadReplyFeed({
  parentId,
  initialReplies,
  currentUserId,
  currentAuthor = null,
  canPost,
}: Props) {
  const [replies, setReplies] = useState<Thread[]>(initialReplies);

  function handlePosted(t: Thread) {
    // 답글은 시간순 (오래된 → 새) 으로 표시되므로 끝에 push.
    setReplies((cur) => [...cur, t]);
  }

  return (
    <>
      {canPost && (
        <ThreadComposer
          parentId={parentId}
          placeholder="답글 남기기…"
          onPosted={handlePosted}
          currentAuthor={currentAuthor}
        />
      )}
      <div className="px-4 py-3 text-[13px] font-bold text-black border-b border-gray-200">
        답글 <span className="text-gray-500 tabular-nums">{replies.length}</span>
      </div>
      <ThreadList
        threads={replies}
        currentUserId={currentUserId}
        showAuthor={true}
        emptyText="아직 답글이 없어. 첫 답을 남겨봐."
      />
    </>
  );
}
