import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadList, { type Thread } from '@/components/ThreadList';
import ThreadComposer from '@/components/ThreadComposer';
import ThreadProfileCard from '@/components/ThreadProfileCard';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { attachAuthorsToThreads } from '@/lib/threads-fetch';
import { fetchThreadProfile } from '@/lib/thread-profile';

export const dynamic = 'force-dynamic';
export const metadata = { title: '내 스레드 — 멜른버그' };

export default async function ThreadsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Layout current="threads">
        <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '내 스레드', bold: true }]} meta="Threads" />
        <section className="py-20 text-center">
          <p className="text-[14px] text-muted mb-6">로그인이 필요해요.</p>
          <Link href="/login" className="inline-block bg-navy text-white px-6 py-3 text-[13px] font-bold no-underline hover:bg-navy-dark">로그인</Link>
        </section>
      </Layout>
    );
  }

  const supabase = await createClient();

  // 본인 스레드 (parent_id is null — 답글 제외)
  // PostgREST FK 모호 회피 — author 별도 fetch + 병합
  const [{ data: rows }, mainProfile, threadProfile] = await Promise.all([
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', user.id)
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    getCurrentProfile(),
    fetchThreadProfile(supabase, user.id),
  ]);

  const threadCore = (rows ?? []) as Array<{
    id: number;
    author_id: string;
    parent_id: number | null;
    content: string;
    like_count: number;
    reply_count: number;
    created_at: string;
  }>;
  const enriched = await attachAuthorsToThreads(supabase, threadCore);
  const threads = enriched as unknown as Thread[];

  // 좋아요 상태
  let likedSet = new Set<number>();
  if (threads.length > 0) {
    const { data: likes } = await supabase
      .from('thread_likes')
      .select('thread_id')
      .eq('user_id', user.id)
      .in('thread_id', threads.map((t) => t.id));
    likedSet = new Set(((likes ?? []) as Array<{ thread_id: number }>).map((l) => l.thread_id));
  }
  const threadsWithLiked: Thread[] = threads.map((t) => ({ ...t, liked: likedSet.has(t.id) }));

  // 가장 오래된 스레드 일자 (시작일)
  const oldestIso = threadsWithLiked.length > 0
    ? threadsWithLiked[threadsWithLiked.length - 1].created_at
    : null;

  return (
    <Layout current="threads">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '내 스레드', bold: true }]} meta="Threads" />
      {/* 페이지 wrap — 일기장 톤. 메인 게시판과 구분되는 차분한 배경 */}
      <div className="bg-[#fafafa] min-h-[calc(100vh-66px)]">
        <section className="py-6">
          <div className="max-w-[640px] mx-auto px-4">
            <ThreadProfileCard
              threadProfile={threadProfile}
              fallbackProfile={{
                display_name: mainProfile?.display_name ?? user.email?.split('@')[0] ?? null,
                avatar_url: mainProfile?.avatar_url ?? null,
              }}
              threadCount={threadsWithLiked.length}
              isOwner
              joinedAtIso={oldestIso}
            />
            <ThreadComposer />
            <div className="mt-2 border border-border rounded-xl overflow-hidden bg-white">
              {threadsWithLiked.length === 0 ? (
                <p className="text-[13px] text-muted text-center py-12">
                  아직 작성한 스레드가 없어요. 오늘의 한 줄을 남겨보세요.
                </p>
              ) : (
                <ThreadList threads={threadsWithLiked} currentUserId={user.id} showAuthor={false} />
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
