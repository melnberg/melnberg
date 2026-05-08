import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadComposer from '@/components/ThreadComposer';
import ThreadProfileCard from '@/components/ThreadProfileCard';
import ThreadProfileActions from '@/components/ThreadProfileActions';
import ThreadTabs from '@/components/ThreadTabs';
import { type Thread } from '@/components/ThreadList';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { attachAuthorsToThreads } from '@/lib/threads-fetch';
import { fetchThreadProfile } from '@/lib/thread-profile';

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
  const [{ data: threadRows }, { data: replyRows }, mainProfile, threadProfile] = await Promise.all([
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', user.id)
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', user.id)
      .not('parent_id', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    getCurrentProfile(),
    fetchThreadProfile(supabase, user.id),
  ]);

  const threadCore = (threadRows ?? []) as ThreadCoreRow[];
  const replyCore = (replyRows ?? []) as ThreadCoreRow[];

  const allCore = [...threadCore, ...replyCore];
  const enrichedAll = await attachAuthorsToThreads(supabase, allCore);
  const enrichedThreads = enrichedAll.slice(0, threadCore.length);
  const enrichedReplies = enrichedAll.slice(threadCore.length);

  // 좋아요 상태
  const allIds = allCore.map((t) => t.id);
  let likedSet = new Set<number>();
  if (allIds.length > 0) {
    const { data: likes } = await supabase
      .from('thread_likes')
      .select('thread_id')
      .eq('user_id', user.id)
      .in('thread_id', allIds);
    likedSet = new Set(((likes ?? []) as Array<{ thread_id: number }>).map((l) => l.thread_id));
  }

  const threads: Thread[] = (enrichedThreads as unknown as Thread[]).map((t) => ({ ...t, liked: likedSet.has(t.id) }));
  const replies: Thread[] = (enrichedReplies as unknown as Thread[]).map((t) => ({ ...t, liked: likedSet.has(t.id) }));

  // 가장 오래된 스레드 일자 (시작일)
  const oldestIso = threads.length > 0 ? threads[threads.length - 1].created_at : null;

  return (
    <Layout current="threads">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '스레드', bold: true }]} meta="Threads" />
      <div className="bg-white min-h-[calc(100vh-66px)]">
        <div className="max-w-[640px] mx-auto bg-white">
          {/* 프로필 헤더 — Threads 식 (좌측 정보 / 우측 아바타) */}
          <ThreadProfileCard
            threadProfile={threadProfile}
            fallbackProfile={{
              display_name: mainProfile?.display_name ?? user.email?.split('@')[0] ?? null,
              avatar_url: mainProfile?.avatar_url ?? null,
            }}
            threadCount={threads.length}
            isOwner
            joinedAtIso={oldestIso}
          />

          {/* 본인 — 편집 / 공유 버튼 */}
          <ThreadProfileActions />

          {/* 작성 폼 — 흑백 */}
          <ThreadComposer />

          {/* 4탭 — 스레드 / 답글 / 미디어 / 리포스트 */}
          <ThreadTabs
            threads={threads}
            replies={replies}
            currentUserId={user.id}
            showAuthor={false}
          />
        </div>
      </div>
    </Layout>
  );
}
