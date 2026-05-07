import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import CommentSection from '@/components/CommentSection';
import PostActions from '@/components/PostActions';
import PostViewCounter from '@/components/PostViewCounter';
import Nickname from '@/components/Nickname';
import RewardTooltip from '@/components/RewardTooltip';
import PostLikeButton from '@/components/PostLikeButton';
import PollWidget from '@/components/PollWidget';
import { getPost, listComments, formatRelativeKo } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';
import { linkify } from '@/lib/linkify';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import { fetchPostPoll } from '@/lib/post-poll';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id), 'hotdeal');
  if (!post) return {};
  return {
    title: `${post.title} — 핫딜 — 멜른버그`,
    description: post.content.slice(0, 140),
  };
}

export default async function HotdealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const [post, comments] = await Promise.all([getPost(numId, 'hotdeal'), listComments(numId)]);
  if (!post) notFound();

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
  const farmEarned = ((farmRows ?? []) as Array<{ earned: number | string }>).reduce<number>((sum, r) => sum + Number(r.earned ?? 0), 0);
  const postCreationEarned = earnedMap.get(`hotdeal_post:${numId}`) ?? earnedMap.get(`community_post:${numId}`) ?? 0;
  const postEarned = postCreationEarned + farmEarned;
  const commentEarnedMap: Record<number, number> = {};
  for (const cid of commentIds) {
    const v = earnedMap.get(`hotdeal_comment:${cid}`) ?? earnedMap.get(`community_comment:${cid}`);
    if (v && v > 0) commentEarnedMap[cid] = v;
  }
  if (post.deleted_at) {
    return (
      <Layout current="hotdeal">
        <MainTop crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/hotdeal', label: '핫딜' },
          { label: '삭제된 글', bold: true },
        ]} meta="Deleted" />
        <article className="py-24">
          <div className="max-w-[520px] mx-auto px-6 text-center">
            <div className="text-[14px] font-bold tracking-wider uppercase text-muted mb-4">DELETED</div>
            <h1 className="text-[22px] font-bold text-[#92400e] mb-3">게시글이 삭제되었습니다</h1>
            <p className="text-[13px] text-muted leading-relaxed mb-8">작성자가 이 핫딜을 삭제했어요.</p>
            <Link href="/hotdeal" className="inline-block bg-[#f59e0b] text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-[#d97706]">
              ← 핫딜 목록
            </Link>
          </div>
        </article>
      </Layout>
    );
  }

  const supabase = await createClient();
  // 조회수 +1 은 클라이언트(<PostViewCounter />)에서 sessionStorage dedup 후 처리.
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthor = user?.id === post.author_id;

  let currentUserName: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    currentUserName =
      profile?.display_name ??
      (user.user_metadata?.display_name as string | undefined) ??
      user.email?.split('@')[0] ??
      '회원';
  }

  const pollData = await fetchPostPoll(numId, user?.id ?? null);

  return (
    <Layout current="hotdeal">
      <PostViewCounter postId={post.id} />
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/hotdeal', label: '핫딜' },
          { label: post.title, bold: true },
        ]}
        meta="Hot Deal"
      />

      <article className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <header className="pb-6 mb-6 border-b border-[#fde68a]">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="inline-block bg-[#fef3c7] text-[#78350f] text-[10px] font-bold tracking-widest uppercase px-2 py-0.5">HOT DEAL</div>
              <PostLikeButton postId={post.id} initialCount={post.like_count ?? 0} />
            </div>
            <h1 className="text-[28px] font-bold text-[#92400e] tracking-tight leading-tight mb-3 break-keep">{post.title}</h1>
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
                  <RewardTooltip earned={postEarned} kind="hotdeal_post" />
                </>
              )}
              {isAuthor && (
                <>
                  <span>·</span>
                  <PostActions postId={post.id} basePath="/hotdeal" />
                </>
              )}
            </div>
          </header>

          <div className="text-[15px] leading-loose break-keep whitespace-pre-wrap mb-12">
            {linkify(post.content)}
          </div>

          {pollData.poll && (
            <PollWidget
              postId={post.id}
              poll={pollData.poll}
              options={pollData.options}
              votes={pollData.votes}
              myVote={pollData.myVote}
              currentUserId={user?.id ?? null}
              isAuthor={isAuthor}
            />
          )}

          <CommentSection
            postId={post.id}
            comments={comments}
            currentUserId={user?.id ?? null}
            currentUserName={currentUserName}
            postCategory="hotdeal"
          />

          <div className="mt-10 pt-6 border-t border-border flex justify-between items-center">
            <Link href="/hotdeal" className="text-[13px] font-bold text-[#92400e] no-underline hover:underline">
              ← 목록으로
            </Link>
          </div>
        </div>
      </article>
    </Layout>
  );
}
