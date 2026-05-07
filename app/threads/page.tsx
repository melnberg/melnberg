import Link from 'next/link';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadList, { type Thread } from '@/components/ThreadList';
import ThreadComposer from '@/components/ThreadComposer';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

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
  const { data: rows } = await supabase
    .from('threads')
    .select('id, author_id, parent_id, content, like_count, reply_count, created_at, author:profiles!author_id(display_name, avatar_url, tier, tier_expires_at, is_solo, link_url)')
    .eq('author_id', user.id)
    .is('parent_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const threads = (rows ?? []) as unknown as Thread[];

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

  return (
    <Layout current="threads">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '내 스레드', bold: true }]} meta="Threads" />
      <section className="py-6">
        <div className="max-w-[640px] mx-auto px-4">
          <div className="flex items-baseline justify-between gap-4 pb-3 mb-3 border-b-2 border-cyan">
            <h1 className="text-[22px] font-bold text-navy tracking-tight">내 스레드</h1>
            <span className="text-[11px] text-muted">{threadsWithLiked.length}개</span>
          </div>
          <ThreadComposer />
          <div className="mt-2">
            {threadsWithLiked.length === 0 ? (
              <p className="text-[13px] text-muted text-center py-12">아직 작성한 스레드가 없어요. 첫 글을 남겨보세요.</p>
            ) : (
              <ThreadList threads={threadsWithLiked} currentUserId={user.id} showAuthor={false} />
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
