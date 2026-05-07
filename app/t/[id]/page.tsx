import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import ThreadList, { type Thread } from '@/components/ThreadList';
import ThreadComposer from '@/components/ThreadComposer';
import Nickname from '@/components/Nickname';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import { linkify } from '@/lib/linkify';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
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

  // 메인 스레드 — PostgREST FK 모호 회피 (author 별도 fetch)
  const { data: mainRaw } = await supabase
    .from('threads')
    .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
    .eq('id', threadId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!mainRaw) notFound();

  const main = mainRaw as ThreadCoreRow;

  // 답글 — parent_id = threadId, 평면 (children 의 children 는 단순화)
  const { data: repliesRaw } = await supabase
    .from('threads')
    .select('id, author_id, parent_id, content, like_count, reply_count, created_at')
    .eq('parent_id', threadId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  const replies = (repliesRaw ?? []) as ThreadCoreRow[];

  // author 일괄 병합 (메인 + 답글)
  const allCore: ThreadCoreRow[] = [main, ...replies];
  const enriched = await attachAuthorsToThreads(supabase, allCore);
  const mainEnriched = enriched[0]!;
  const repliesEnriched = enriched.slice(1);

  // 좋아요 상태 — 메인 + 답글 모두
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

  return (
    <Layout>
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: `/u/${mainThread.author_id}`, label: authorName },
        { href: `/t/${threadId}`, label: '스레드', bold: true },
      ]} meta="Thread" />

      <section className="py-10">
        <div className="max-w-[680px] mx-auto px-6">
          {/* 메인 스레드 — 단독 강조 카드 */}
          <article className="border border-border bg-white p-5 mb-4">
            <div className="flex items-center gap-3 mb-3">
              {mainThread.author?.avatar_url ? (
                <img src={mainThread.author.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border border-border flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-navy-soft border border-border flex items-center justify-center text-navy text-[16px] font-bold flex-shrink-0">
                  {(authorName[0] ?? '?').toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[14px]">
                  <Nickname info={profileToNicknameInfo(mainThread.author, mainThread.author_id)} />
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  {new Date(mainThread.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
            <div className="text-[15px] text-text whitespace-pre-wrap break-words leading-relaxed">
              {linkify(mainThread.content)}
            </div>
            <div className="flex items-center gap-5 mt-4 pt-3 border-t border-border text-[12px] text-muted">
              <span className="flex items-center gap-1">
                <span aria-hidden>{mainThread.liked ? '♥' : '♡'}</span>
                <span className="tabular-nums">{mainThread.like_count}</span>
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden>💬</span>
                <span className="tabular-nums">{mainThread.reply_count}</span>
              </span>
            </div>
          </article>

          {/* 답글 입력 — 로그인 사용자 */}
          {me?.id && (
            <ThreadComposer parentId={threadId} placeholder="답글 작성..." />
          )}

          {/* 답글 트리 */}
          <h2 className="text-[12px] font-bold tracking-widest uppercase text-muted mt-6 mb-2">답글 ({repliesNorm.length})</h2>
          <ThreadList
            threads={repliesNorm}
            currentUserId={me?.id ?? null}
            showAuthor={true}
            emptyText="아직 답글이 없어요."
          />
        </div>
      </section>
    </Layout>
  );
}
