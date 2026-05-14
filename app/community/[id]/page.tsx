import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import CommentSection from '@/components/CommentSection';
import PostActions from '@/components/PostActions';
import RewardTooltip from '@/components/RewardTooltip';
import PostLikeButton from '@/components/PostLikeButton';
import HyojaButton from '@/components/HyojaButton';
import PostViewCounter from '@/components/PostViewCounter';
import Nickname from '@/components/Nickname';
import PollWidget from '@/components/PollWidget';
import { getPost, listComments, formatRelativeKo } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';
import { linkify } from '@/lib/linkify';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import { fetchPostPoll } from '@/lib/post-poll';

export const dynamic = 'force-dynamic';

// 카테고리 → 전용 게시판 경로. community 가 아닌 글이 /community/[id] 로 열리는 걸 차단.
const CATEGORY_BASE: Record<string, string> = {
  hotdeal: '/hotdeal', stocks: '/stocks', realty: '/realty',
  worry: '/worry', coin: '/coin', love: '/love', blog: '/blog',
};

// 카테고리 불일치 시 해당 게시판 상세로 redirect.
// 익명 게시판(worry/love) 글이 커뮤니티 상세로 열려 작성자·댓글 실명이 노출되던 사고 방지.
// ⚠ generateMetadata 에서 호출해야 함 — 페이지 컴포넌트 렌더(스트리밍) 시작 전이라
//   정상 HTTP 307 이 나감. 페이지 컴포넌트에서 redirect 하면 streaming 폴백으로
//   <meta http-equiv="refresh"> (200 HTML) 가 되어 1초 지연·부분 렌더 사고가 남.
function redirectIfWrongBoard(category: string | null | undefined, numId: number) {
  if (category && category !== 'community' && CATEGORY_BASE[category]) {
    redirect(`${CATEGORY_BASE[category]}/${numId}`);
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  const post = await getPost(numId);
  if (!post) return {};
  redirectIfWrongBoard(post.category, numId);
  return {
    title: `${post.title} — 멜른버그`,
    description: post.content.slice(0, 140),
  };
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const [post, comments] = await Promise.all([getPost(numId), listComments(numId)]);
  if (!post) notFound();

  // 방어 — generateMetadata 에서 이미 처리되지만 직접 진입 등 대비.
  redirectIfWrongBoard(post.category, numId);

  // mlbg 적립 — 본글 + 댓글 + 게시글 농사 보너스 한 번에 fetch (병렬)
  const sbPub = await createClient();
  const commentIds = comments.map((c) => c.id);
  const [awardResp, farmResp] = await Promise.all([
    sbPub.from('mlbg_award_log').select('kind, ref_id, earned').in('ref_id', [numId, ...commentIds])
      .then((r) => r, () => ({ data: null })),
    sbPub.from('mlbg_farm_log').select('earned').eq('post_id', numId)
      .then((r) => r, () => ({ data: null })),
  ]);
  const awardRows = (awardResp as { data: unknown[] | null }).data;
  const farmRows = (farmResp as { data: unknown[] | null }).data;
  const earnedMap = new Map<string, number>();
  for (const r of (awardRows ?? []) as Array<{ kind: string; ref_id: number; earned: number }>) {
    earnedMap.set(`${r.kind}:${r.ref_id}`, Number(r.earned));
  }
  // 게시글 농사 합산 — 다른 사람이 댓글 1개당 작성자 +0.5(community) / +2(hotdeal). 1인 1글 1회.
  const farmEarned = ((farmRows ?? []) as Array<{ earned: number | string }>).reduce<number>((sum, r) => sum + Number(r.earned ?? 0), 0);
  const postCreationEarned = earnedMap.get(`community_post:${numId}`) ?? earnedMap.get(`hotdeal_post:${numId}`) ?? 0;
  const postEarned = postCreationEarned + farmEarned;
  // 댓글 id → earned 매핑 (CommentSection 으로 전달)
  const commentEarnedMap: Record<number, number> = {};
  for (const cid of commentIds) {
    const v = earnedMap.get(`community_comment:${cid}`) ?? earnedMap.get(`hotdeal_comment:${cid}`);
    if (v && v > 0) commentEarnedMap[cid] = v;
  }
  // 삭제된 글 — 친절한 안내 페이지
  if (post.deleted_at) {
    return (
      <Layout current="community">
        <MainTop crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/community', label: '커뮤니티' },
          { label: '삭제된 글', bold: true },
        ]} meta="Deleted" />
        <article className="py-24">
          <div className="max-w-[520px] mx-auto px-6 text-center">
            <div className="text-[14px] font-bold tracking-wider uppercase text-muted mb-4">DELETED</div>
            <h1 className="text-[22px] font-bold text-navy mb-3">게시글이 삭제되었습니다</h1>
            <p className="text-[13px] text-muted leading-relaxed mb-8">작성자가 이 글을 삭제했어요. 다른 글을 둘러보세요.</p>
            <Link href="/community" className="inline-block bg-navy text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-navy-dark">
              ← 커뮤니티 목록
            </Link>
          </div>
        </article>
      </Layout>
    );
  }

  const supabase = await createClient();
  // 조회수 +1 은 클라이언트(<PostViewCounter />)에서 sessionStorage dedup 후 처리.
  // 서버에서 부르면 prefetch / router.refresh 로 첫 진입에 2~3회 발화되는 문제.
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthor = user?.id === post.author_id;

  let currentUserName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    currentUserName =
      profile?.display_name ??
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split('@')[0] ??
      '회원';
  }

  // 투표 fetch
  const pollData = await fetchPostPoll(numId, user?.id ?? null);

  return (
    <Layout current="community">
      <PostViewCounter postId={post.id} />
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/community', label: '커뮤니티' },
          { label: post.title, bold: true },
        ]}
        meta="Post"
      />

      <article className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          {/* 헤더 */}
          <header className="pb-6 mb-6 border-b border-border">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h1 className="text-[28px] font-bold text-navy tracking-tight leading-tight break-keep flex-1">{post.title}</h1>
              <div className="flex items-center gap-2 shrink-0">
                <HyojaButton />
              </div>
            </div>
            <div className="flex items-center gap-3 text-[12px] text-muted flex-wrap">
              <span className="font-bold text-navy">
                <Nickname info={profileToNicknameInfo(post.author, post.author_id)} />
              </span>
              <span>·</span>
              <span>{formatRelativeKo(post.created_at)}</span>
              {post.updated_at !== post.created_at && (
                <>
                  <span>·</span>
                  <span>수정됨</span>
                </>
              )}
              {postEarned > 0 && (
                <>
                  <span>·</span>
                  <RewardTooltip earned={postEarned} kind="community_post" />
                </>
              )}
              {isAuthor && (
                <>
                  <span>·</span>
                  <PostActions postId={post.id} />
                </>
              )}
            </div>
          </header>

          {/* 본문 — 글 안의 URL 은 자동 링크 변환. 좋아요는 본문 좌측 하단. */}
          <div className="text-[15px] leading-loose break-keep whitespace-pre-wrap mb-6">
            {linkify(post.content)}
          </div>
          <div className="mb-12">
            <PostLikeButton postId={post.id} initialCount={post.like_count ?? 0} />
          </div>

          {/* 투표 (있을 때만) */}
          {pollData.poll && (
            <PollWidget
              postId={post.id}
              poll={pollData.poll}
              options={pollData.options}
              votes={pollData.votes}
              myVote={pollData.myVote}
              voters={pollData.voters}
              currentUserId={user?.id ?? null}
              isAuthor={isAuthor}
            />
          )}

          {/* 댓글 */}
          <CommentSection
            postId={post.id}
            comments={comments}
            currentUserId={user?.id ?? null}
            currentUserName={currentUserName}
            postCategory="community"
            earnedMap={commentEarnedMap}
          />

          {/* 목록으로 */}
          <div className="mt-10 pt-6 border-t border-border flex justify-between items-center">
            <Link
              href="/community"
              className="text-[13px] font-bold text-navy no-underline hover:underline"
            >
              ← 목록으로
            </Link>
          </div>
        </div>
      </article>

    </Layout>
  );
}
