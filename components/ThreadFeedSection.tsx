'use client';

import { useState } from 'react';
import ThreadComposer from './ThreadComposer';
import ThreadTabs from './ThreadTabs';
import type { Thread } from './ThreadList';

type Props = {
  initialThreads: Thread[];
  initialReplies: Thread[];
  currentUserId: string | null;
  canPost?: boolean;
  currentAuthor?: Thread['author'] | null;
  showAuthor?: boolean;
};

export default function ThreadFeedSection({
  initialThreads,
  initialReplies,
  currentUserId,
  canPost = false,
  currentAuthor = null,
  showAuthor = false,
}: Props) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [replies] = useState<Thread[]>(initialReplies);

  function handlePosted(t: Thread) {
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
