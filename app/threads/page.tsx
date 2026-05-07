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
export const metadata = { title: '나의 일깃장 — 멜른버그' };

// 따뜻한 1줄 환영 — 닉네임 첫 글자 코드값 + 시각으로 결정 (랜덤 X — 새로고침 시 깜빡 방지)
function pickWelcome(name: string, hour: number): string {
  const lines = [
    `${name}, 오늘 하루도 수고했어.`,
    `${name}, 여기는 너만의 공간이야.`,
    `${name}, 마음에 남는 한 마디 남겨봐.`,
    `${name}, 천천히 풀어놔도 괜찮아.`,
    `${name}, 오늘은 어땠어?`,
  ];
  const seed = (name.charCodeAt(0) || 0) + hour;
  return lines[seed % lines.length];
}

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

export default async function ThreadsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Layout current="threads">
        <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '나의 일깃장', bold: true }]} meta="Diary" />
        <div className="bg-[#fdf6e3] min-h-[calc(100vh-66px)]">
          <section className="py-20 text-center">
            <p className="text-[14px] text-[#5c4634] mb-6">일깃장은 로그인 후에 열려.</p>
            <Link href="/login" className="inline-block bg-[#5c4634] text-[#fff8ec] px-6 py-3 text-[13px] font-bold no-underline hover:bg-[#3d2f22] rounded-full">로그인</Link>
          </section>
        </div>
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

  // 환영 메시지 — 본인 닉네임 + 마지막 글 시각
  const welcomeName = mainProfile?.display_name ?? user.email?.split('@')[0] ?? '회원';
  const nowSeoulHour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }));
  const welcomeLine = pickWelcome(welcomeName, nowSeoulHour);
  const lastIso = threadsWithLiked.length > 0 ? threadsWithLiked[0].created_at : null;
  const lastLabel = lastIso ? `마지막 글: ${relativeFromNow(lastIso)}` : '오늘 첫 글이야';
  const ownerBio = threadProfile?.bio?.trim() || null;

  return (
    <Layout current="threads">
      <MainTop crumbs={[{ href: '/', label: '멜른버그' }, { label: '나의 일깃장', bold: true }]} meta="Diary" />
      {/* 페이지 wrap — 일기장 톤. 따뜻한 크림 배경 + 일기장 종이 결 (가벼운 줄 무늬). */}
      <div
        className="bg-[#fdf6e3] min-h-[calc(100vh-66px)]"
        style={{
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.0) calc(100% - 1px), rgba(168, 130, 90, 0.06) 100%)',
          backgroundSize: '100% 32px',
        }}
      >
        <section className="py-8">
          <div className="max-w-[620px] mx-auto px-4">
            {/* 환영 헤더 카드 — 따뜻한 라운드 + 두꺼운 베이지 테두리 */}
            <div className="bg-[#fff8ec] border-2 border-[#e8d9b8] rounded-3xl px-6 py-6 mb-5 shadow-[0_4px_24px_rgba(120,90,50,0.06)]">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#a07f5f] mb-2">나의 일깃장</div>
              <h1 className="text-[20px] sm:text-[22px] font-bold text-[#5c4634] leading-snug" style={{ fontFamily: 'serif' }}>
                {welcomeLine}
              </h1>
              <div className="mt-2 text-[12px] text-[#8a6f55] leading-relaxed">{lastLabel}</div>
              {ownerBio && (
                <blockquote className="mt-4 pl-3 border-l-2 border-[#c89b6f] text-[13px] text-[#5c4634] italic leading-relaxed whitespace-pre-wrap">
                  {ownerBio}
                </blockquote>
              )}
            </div>

            {/* 프로필 카드 — 일기장 톤으로 자체 재스타일 */}
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

            {/* 작성 폼 */}
            <ThreadComposer />

            {/* 글 목록 — 일기장 종이 카드 */}
            <div className="mt-2 bg-[#fff8ec] border-2 border-[#e8d9b8] rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(120,90,50,0.05)]">
              {threadsWithLiked.length === 0 ? (
                <p className="text-[13px] text-[#8a6f55] text-center py-14 leading-loose">
                  빈 페이지야.<br/>오늘의 한 줄을 남겨봐.
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
