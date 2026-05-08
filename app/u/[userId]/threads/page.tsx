import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadList, { type Thread } from '@/components/ThreadList';
import ThreadComposer from '@/components/ThreadComposer';
import ThreadProfileCard from '@/components/ThreadProfileCard';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { attachAuthorsToThreads } from '@/lib/threads-fetch';
import { fetchThreadProfile } from '@/lib/thread-profile';

export const dynamic = 'force-dynamic';

function relativeFromNow(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일 전`;
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });
}

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

  const [{ data: rows }, threadProfile] = await Promise.all([
    supabase
      .from('threads')
      .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
      .eq('author_id', userId)
      .is('parent_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    fetchThreadProfile(supabase, userId),
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

  let likedSet = new Set<number>();
  if (viewer && threads.length > 0) {
    const { data: likes } = await supabase
      .from('thread_likes')
      .select('thread_id')
      .eq('user_id', viewer.id)
      .in('thread_id', threads.map((t) => t.id));
    likedSet = new Set(((likes ?? []) as Array<{ thread_id: number }>).map((l) => l.thread_id));
  }
  const threadsWithLiked: Thread[] = threads.map((t) => ({ ...t, liked: likedSet.has(t.id) }));

  const oldestIso = threadsWithLiked.length > 0
    ? threadsWithLiked[threadsWithLiked.length - 1].created_at
    : null;
  const lastIso = threadsWithLiked.length > 0 ? threadsWithLiked[0].created_at : null;

  const ownerName = threadProfile?.display_name ?? owner.display_name ?? '익명';
  const ownerBio = threadProfile?.bio?.trim() || null;

  const headerLabel = isOwner ? '나의 일깃장' : '일깃장';
  const headerTitle = isOwner
    ? `${ownerName}, 오늘 하루도 수고했어.`
    : `${ownerName} 의 일깃장이야.`;
  const headerSub = lastIso
    ? `마지막 글: ${relativeFromNow(lastIso)}`
    : (isOwner ? '오늘 첫 글이야' : '아직 비어 있어');

  return (
    <Layout current={isOwner ? 'threads' : undefined}>
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: `/u/${userId}`, label: ownerName },
          { label: '일깃장', bold: true },
        ]}
        meta="Diary"
      />
      <div
        className="bg-[#fdf6e3] min-h-[calc(100vh-66px)]"
        style={{
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.0) calc(100% - 1px), rgba(168, 130, 90, 0.06) 100%)',
          backgroundSize: '100% 32px',
        }}
      >
        <section className="py-8">
          <div className="max-w-[620px] mx-auto px-4">
            <div className="bg-[#fff8ec] border-2 border-[#e8d9b8] rounded-3xl px-6 py-6 mb-5 shadow-[0_4px_24px_rgba(120,90,50,0.06)]">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#a07f5f] mb-2">{headerLabel}</div>
              <h1 className="text-[20px] sm:text-[22px] font-bold text-[#5c4634] leading-snug" style={{ fontFamily: 'serif' }}>
                {headerTitle}
              </h1>
              <div className="mt-2 text-[12px] text-[#8a6f55] leading-relaxed">{headerSub}</div>
              {ownerBio && (
                <blockquote className="mt-4 pl-3 border-l-2 border-[#c89b6f] text-[13px] text-[#5c4634] italic leading-relaxed whitespace-pre-wrap">
                  {ownerBio}
                </blockquote>
              )}
              {!isOwner && (
                <div className="mt-4">
                  <Link
                    href={`/u/${userId}`}
                    className="text-[12px] text-[#a07f5f] hover:text-[#5c4634] no-underline"
                  >
                    ← 프로필로
                  </Link>
                </div>
              )}
            </div>

            <ThreadProfileCard
              threadProfile={threadProfile}
              fallbackProfile={{
                display_name: owner.display_name,
                avatar_url: owner.avatar_url,
              }}
              threadCount={threadsWithLiked.length}
              isOwner={isOwner}
              joinedAtIso={oldestIso}
            />

            {/* 작성 폼은 본인만 */}
            {isOwner && <ThreadComposer />}

            <div className="mt-2 bg-[#fff8ec] border-2 border-[#e8d9b8] rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(120,90,50,0.05)]">
              {threadsWithLiked.length === 0 ? (
                <p className="text-[13px] text-[#8a6f55] text-center py-14 leading-loose">
                  {isOwner ? <>빈 페이지야.<br/>오늘의 한 줄을 남겨봐.</> : '아직 글이 없어.'}
                </p>
              ) : (
                <ThreadList threads={threadsWithLiked} currentUserId={viewer?.id ?? null} showAuthor={false} />
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
