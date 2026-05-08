import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadComposer from '@/components/ThreadComposer';
import ThreadProfileCard from '@/components/ThreadProfileCard';
import ThreadProfileActions from '@/components/ThreadProfileActions';
import ThreadTabs from '@/components/ThreadTabs';
import { type Thread } from '@/components/ThreadList';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { attachAuthorsToThreads } from '@/lib/threads-fetch';
import { fetchThreadProfile } from '@/lib/thread-profile';

export const dynamic = 'force-dynamic';

type ThreadCoreRow = {
  id: number;
  author_id: string;
  parent_id: number | null;
  content: string;
  like_count: number;
  reply_count: number;
  created_at: string;
};

export default async function UserThreadsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!userId) notFound();

  const supabase = await createClient();
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === userId;

  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (!ownerProfile) notFound();

  const owner = ownerProfile as { id: string; display_name: string | null; avatar_url: string | null };

  const [{ data: threadRows }, { data: replyRows }, threadProfile] = await Promise.all([
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', userId)
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', userId)
      .not('parent_id', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    fetchThreadProfile(supabase, userId),
  ]);

  const threadCore = (threadRows ?? []) as ThreadCoreRow[];
  const replyCore = (replyRows ?? []) as ThreadCoreRow[];

  const allCore = [...threadCore, ...replyCore];
  const enrichedAll = await attachAuthorsToThreads(supabase, allCore);
  const enrichedThreads = enrichedAll.slice(0, threadCore.length);
  const enrichedReplies = enrichedAll.slice(threadCore.length);

  let likedSet = new Set<number>();
  if (viewer && allCore.length > 0) {
    const { data: likes } = await supabase
      .from('thread_likes')
      .select('thread_id')
      .eq('user_id', viewer.id)
      .in('thread_id', allCore.map((t) => t.id));
    likedSet = new Set(((likes ?? []) as Array<{ thread_id: number }>).map((l) => l.thread_id));
  }

  const threads: Thread[] = (enrichedThreads as unknown as Thread[]).map((t) => ({ ...t, liked: likedSet.has(t.id) }));
  const replies: Thread[] = (enrichedReplies as unknown as Thread[]).map((t) => ({ ...t, liked: likedSet.has(t.id) }));

  const oldestIso = threads.length > 0 ? threads[threads.length - 1].created_at : null;
  const ownerName = threadProfile?.display_name ?? owner.display_name ?? '익명';

  return (
    <Layout current={isOwner ? 'threads' : undefined}>
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: `/u/${userId}`, label: ownerName },
          { label: '스레드', bold: true },
        ]}
        meta="Threads"
      />
      <div className="bg-white min-h-[calc(100vh-66px)]">
        <div className="max-w-[640px] mx-auto bg-white">
          <ThreadProfileCard
            threadProfile={threadProfile}
            fallbackProfile={{
              display_name: owner.display_name,
              avatar_url: owner.avatar_url,
            }}
            threadCount={threads.length}
            isOwner={isOwner}
            joinedAtIso={oldestIso}
          />

          {/* 본인일 때만 편집·공유 버튼 */}
          {isOwner && <ThreadProfileActions />}

          {/* 본인일 때만 작성 폼 */}
          {isOwner && <ThreadComposer />}

          <ThreadTabs
            threads={threads}
            replies={replies}
            currentUserId={viewer?.id ?? null}
            showAuthor={false}
          />
        </div>
      </div>
    </Layout>
  );
}
