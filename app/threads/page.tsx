import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadProfileCard from '@/components/ThreadProfileCard';
import ThreadFeed from '@/components/ThreadFeed';
import { type Thread } from '@/components/ThreadList';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { attachAuthorsToThreads } from '@/lib/threads-fetch';

export const dynamic = 'force-dynamic';
export const metadata = { title: '스레드 — 멜른버그' };

type ThreadCoreRow = {
  id: number;
  author_id: string;
  parent_id: number | null;
  content: string;
  like_count: number;
  reply_count: number;
  created_at: string;
};

export default async function ThreadsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Layout current="threads">
        <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '스레드', bold: true }]} meta="Threads" />
        <div className="bg-white min-h-[calc(100vh-66px)]">
          <section className="py-20 text-center">
            <p className="text-[14px] text-gray-500 mb-6">스레드는 로그인 후에 열려.</p>
            <Link href="/login" className="inline-block bg-black text-white px-6 py-3 text-[14px] font-bold no-underline hover:bg-gray-800 rounded-full">로그인</Link>
          </section>
        </div>
      </Layout>
    );
  }

  const supabase = await createClient();

  // 본인 스레드 (parent_id is null) + 본인 답글 (parent_id is not null) 동시 fetch
  // 모든 fetch 는 catch 폴백 — 한 곳 실패해도 페이지 안 깨짐.
  const [threadResp, replyResp, mainProfile] = await Promise.all([
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', user.id)
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then((r) => r, () => ({ data: null })),
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', user.id)
      .not('parent_id', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then((r) => r, () => ({ data: null })),
    getCurrentProfile().catch(() => null),
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

  // 좋아요 상태 — 실패 시 빈 set
  const allIds = allCore.map((t) => t.id);
  let likedSet = new Set<number>();
  if (allIds.length > 0) {
    try {
      const { data: likes } = await supabase
        .from('thread_likes')
        .select('thread_id')
        .eq('user_id', user.id)
        .in('thread_id', allIds);
      likedSet = new Set(((likes ?? []) as Array<{ thread_id: number }>).map((l) => l.thread_id));
    } catch { /* 빈 set 유지 */ }
  }

  const threads: Thread[] = (enrichedThreads as unknown as Thread[]).map((t) => ({ ...t, liked: likedSet.has(t.id) }));
  const replies: Thread[] = (enrichedReplies as unknown as Thread[]).map((t) => ({ ...t, liked: likedSet.has(t.id) }));

  // 가장 오래된 스레드 일자 (시작일)
  const oldestIso = threads.length > 0 ? threads[threads.length - 1].created_at : null;

  // 작성자 정보 — 메인 프로필에서 (사진·닉네임은 메인 profiles 가 단일 출처)
  const authorForOptimistic: Thread['author'] = {
    display_name: mainProfile?.display_name ?? user.email?.split('@')[0] ?? null,
    avatar_url: mainProfile?.avatar_url ?? null,
    tier: mainProfile?.tier ?? null,
    tier_expires_at: mainProfile?.tier_expires_at ?? null,
    is_solo: mainProfile?.is_solo ?? null,
    link_url: mainProfile?.link_url ?? null,
  };

  return (
    <Layout current="threads">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '스레드', bold: true }]} meta="Threads" />
      <div className="bg-white min-h-[calc(100vh-66px)]">
        <div className="max-w-[640px] mx-auto bg-white">
          {/* 프로필 헤더 — Threads 식 (좌측 정보 / 우측 아바타). 사진·닉네임은 메인 profiles. */}
          <ThreadProfileCard
            profile={{
              display_name: mainProfile?.display_name ?? user.email?.split('@')[0] ?? null,
              avatar_url: mainProfile?.avatar_url ?? null,
            }}
            threadCount={threads.length}
            isOwner
            joinedAtIso={oldestIso}
          />

          {/* composer + tabs — 즉시 반영 */}
          <ThreadFeed
            initialThreads={threads}
            initialReplies={replies}
            currentUserId={user.id}
            canPost
            currentAuthor={authorForOptimistic}
            showAuthor={false}
          />
        </div>
      </div>
    </Layout>
  );
}
