import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import { type Thread } from '@/components/ThreadList';
import ThreadReplyFeed from '@/components/ThreadReplyFeed';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import { linkify } from '@/lib/linkify';
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

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isFinite(threadId) || threadId <= 0) notFound();

  const supabase = await createClient();
  const me = await getCurrentUser();

  // 메인 스레드
  const { data: mainRaw } = await supabase
    .from('threads')
    .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
    .eq('id', threadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!mainRaw) notFound();

  const main = mainRaw as ThreadCoreRow;

  // 답글
  const { data: repliesRaw } = await supabase
    .from('threads')
    .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
    .eq('parent_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  const replies = (repliesRaw ?? []) as ThreadCoreRow[];

  const allCore: ThreadCoreRow[] = [main, ...replies];
  const enriched = await attachAuthorsToThreads(supabase, allCore);
  const mainEnriched = enriched[0]!;
  const repliesEnriched = enriched.slice(1);

  // 좋아요 상태
  const allIds = [main.id, ...replies.map((r) => r.id)];
  let likedSet = new Set<number>();
  if (me?.id && allIds.length > 0) {
    const { data: likes } = await supabase
      .from('thread_likes')
      .select('thread_id')
      .eq('user_id', me.id)
      .in('thread_id', allIds);
    likedSet = new Set((likes ?? []).map((l) => (l as { thread_id: number }).thread_id));
  }

  const mainThread: Thread = {
    id: mainEnriched.id,
    author_id: mainEnriched.author_id,
    parent_id: mainEnriched.parent_id,
    content: mainEnriched.content,
    like_count: mainEnriched.like_count,
    reply_count: mainEnriched.reply_count,
    created_at: mainEnriched.created_at,
    author: mainEnriched.author,
    liked: likedSet.has(mainEnriched.id),
  };

  const repliesNorm: Thread[] = repliesEnriched.map((r) => ({
    id: r.id,
    author_id: r.author_id,
    parent_id: r.parent_id,
    content: r.content,
    like_count: r.like_count,
    reply_count: r.reply_count,
    created_at: r.created_at,
    author: r.author,
    liked: likedSet.has(r.id),
  }));

  const authorName = mainThread.author?.display_name ?? '회원';

  // 답글 작성용 — 본인 메인 프로필을 author 정보로 (낙관적 카드 닉네임/아바타).
  let meAuthor: Thread['author'] | null = null;
  if (me?.id) {
    const meProfile = await getCurrentProfile();
    if (meProfile) {
      meAuthor = {
        display_name: meProfile.display_name ?? null,
        avatar_url: meProfile.avatar_url ?? null,
        tier: meProfile.tier ?? null,
        tier_expires_at: meProfile.tier_expires_at ?? null,
        is_solo: meProfile.is_solo ?? null,
        link_url: meProfile.link_url ?? null,
      };
    }
  }

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: `/u/${mainThread.author_id}`, label: authorName },
        { href: `/t/${threadId}`, label: '글', bold: true },
      ]} meta="Threads" />

      <div className="bg-white min-h-[calc(100vh-66px)]">
        <div className="max-w-[640px] mx-auto bg-white">
          {/* 메인 스레드 — 단독 강조 (Threads 톤) */}
          <article className="px-4 py-4 border-b border-gray-200">
            <div className="flex gap-3">
              {mainThread.author?.avatar_url ? (
                <img src={mainThread.author.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-100 flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-black text-[14px] font-bold flex-shrink-0">
                  {(authorName[0] ?? '?').toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[14px]">
                  <Nickname info={profileToNicknameInfo(mainThread.author, mainThread.author_id)} />
                </div>
                <div className="text-[12px] text-gray-500 mt-0.5">
                  {new Date(mainThread.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="mt-2 text-[15px] text-black whitespace-pre-wrap break-words leading-relaxed">
                  {linkify(mainThread.content)}
                </div>
                <div className="flex items-center gap-5 mt-3 text-[13px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className={mainThread.liked ? 'text-red-500' : ''} aria-hidden>{mainThread.liked ? '♥' : '♡'}</span>
                    <span className="tabular-nums">{mainThread.like_count}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span aria-hidden>💬</span>
                    <span className="tabular-nums">{mainThread.reply_count}</span>
                  </span>
                </div>
              </div>
            </div>
          </article>

          {/* 답글 composer + 리스트 — 작성 시 즉시 반영 */}
          <ThreadReplyFeed
            parentId={threadId}
            initialReplies={repliesNorm}
            currentUserId={me?.id ?? null}
            canPost={!!me?.id}
            currentAuthor={meAuthor}
          />
        </div>
      </div>
    </Layout>
  );
}
