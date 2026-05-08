import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadProfileCard from '@/components/ThreadProfileCard';
import ThreadFeedSection from '@/components/ThreadFeedSection';
import { type Thread } from '@/components/ThreadList';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { attachAuthorsToThreads } from '@/lib/threads-fetch';

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

  const ownerResp = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, tier, tier_expires_at, is_solo, link_url')
    .eq('id', userId)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  const ownerProfile = (ownerResp as { data: unknown }).data;

  if (!ownerProfile) notFound();

  const owner = ownerProfile as {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    tier: string | null;
    tier_expires_at: string | null;
    is_solo: boolean | null;
    link_url: string | null;
  };

  const [threadResp, replyResp] = await Promise.all([
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', userId)
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then((r) => r, () => ({ data: null })),
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', userId)
      .not('parent_id', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then((r) => r, () => ({ data: null })),
  ]);

  const threadCore = (((threadResp as { data: unknown }).data ?? []) as ThreadCoreRow[]);
  const replyCore = (((replyResp as { data: unknown }).data ?? []) as ThreadCoreRow[]);

  const allCore = [...threadCore, ...replyCore];
  let enrichedAll: Array<ThreadCoreRow & { author: Thread['author'] | null }>;
  try {
    enrichedAll = await attachAuthorsToThreads(supabase, allCore) as typeof enrichedAll;
  } catch {
    enrichedAll = allCore.map((c) => ({ ...c, author: null }));
  }
  const enrichedThreads = enrichedAll.slice(0, threadCore.length);
  const enrichedReplies = enrichedAll.slice(threadCore.length);

  let likedSet = new Set<number>();
  if (viewer && allCore.length > 0) {
    try {
      const { data: likes } = await supabase
        .from('thread_likes')
        .select('thread_id')
        .eq('user_id', viewer.id)
        .in('thread_id', allCore.map((t) => t.id));
      likedSet = new Set(((likes ?? []) as Array<{ thread_id: number }>).map((l) => l.thread_id));
    } catch { /* 빈 set 유지 */ }
  }

  const threads: Thread[] = (enrichedThreads as unknown as Thread[]).map((t) => ({ ...t, liked: likedSet.has(t.id) }));
  const replies: Thread[] = (enrichedReplies as unknown as Thread[]).map((t) => ({ ...t, liked: likedSet.has(t.id) }));

  const oldestIso = threads.length > 0 ? threads[threads.length - 1].created_at : null;
  const ownerName = owner.display_name ?? '익명';

  // composer 가 본인 페이지에서만 노출 — 본인 메인 프로필을 author 정보로
  let viewerAuthor: Thread['author'] | null = null;
  if (isOwner) {
    const meProfile = await getCurrentProfile();
    viewerAuthor = {
      display_name: meProfile?.display_name ?? owner.display_name,
      avatar_url: meProfile?.avatar_url ?? owner.avatar_url,
      tier: meProfile?.tier ?? owner.tier,
      tier_expires_at: meProfile?.tier_expires_at ?? owner.tier_expires_at,
      is_solo: meProfile?.is_solo ?? owner.is_solo,
      link_url: meProfile?.link_url ?? owner.link_url,
    };
  }

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
            profile={{
              display_name: owner.display_name,
              avatar_url: owner.avatar_url,
            }}
            threadCount={threads.length}
            isOwner={isOwner}
            joinedAtIso={oldestIso}
          />

          {/* composer + tabs — 본인 페이지면 작성 가능 */}
          <ThreadFeedSection
            initialThreads={threads}
            initialReplies={replies}
            currentUserId={viewer?.id ?? null}
            canPost={isOwner}
            currentAuthor={viewerAuthor}
            showAuthor={false}
          />
        </div>
      </div>
    </Layout>
  );
}
