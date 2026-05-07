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
import StockInfoCard from '@/components/StockInfoCard';
import PollWidget from '@/components/PollWidget';
import { getPost, listComments, formatRelativeKo } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';
import { linkify } from '@/lib/linkify';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import { fetchPostPoll } from '@/lib/post-poll';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id), 'stocks');
  if (!post) return {};
  return {
    title: `${post.title} — 주식 토론 — 멜른버그`,
    description: post.content.slice(0, 140),
  };
}

export default async function StockPostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const [post, comments] = await Promise.all([getPost(numId, 'stocks'), listComments(numId)]);
  if (!post) notFound();

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
  const postEarned = (earnedMap.get(`community_post:${numId}`) ?? 0) + farmEarned;

  if (post.deleted_at) {
    return (
      <Layout current="stocks">
        <MainTop crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/stocks', label: '주식 토론' },
          { label: '삭제된 글', bold: true },
        ]} meta="Deleted" />
        <article className="py-24">
          <div className="max-w-[520px] mx-auto px-6 text-center">
            <h1 className="text-[22px] font-bold text-navy mb-3">게시글이 삭제되었습니다</h1>
            <Link href="/stocks" className="inline-block bg-cyan text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-cyan/80">
              ← 주식 토론 목록
            </Link>
          </div>
        </article>
      </Layout>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthor = user?.id === post.author_id;

  let currentUserName: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    currentUserName = profile?.display_name ?? user.email?.split('@')[0] ?? '회원';
  }

  const pollData = await fetchPostPoll(numId, user?.id ?? null);

  return (
    <Layout current="stocks">
      <PostViewCounter postId={post.id} />
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/stocks', label: '주식 토론' },
        { label: post.title, bold: true },
      ]} meta="Stocks" />

      <article className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <header className="pb-6 mb-6 border-b border-cyan/30">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-block bg-cyan/10 text-navy text-[10px] font-bold tracking-widest uppercase px-2 py-0.5">📈 STOCKS</span>
                {post.stock_code && (
                  <span className="inline-block bg-cyan/15 text-navy text-[11px] font-bold px-2 py-0.5">{post.stock_code}</span>
                )}
              </div>
              <PostLikeButton postId={post.id} initialCount={post.like_count ?? 0} />
            </div>
            <h1 className="text-[28px] font-bold text-navy tracking-tight leading-tight mb-3 break-keep">{post.title}</h1>
            <div className="flex items-center gap-3 text-[12px] text-muted flex-wrap">
              <span className="font-bold text-navy">
                <Nickname info={profileToNicknameInfo(post.author, post.author_id)} />
              </span>
              <span>·</span>
              <span>{formatRelativeKo(post.created_at)}</span>
              {post.updated_at !== post.created_at && (<><span>·</span><span>수정됨</span></>)}
              {postEarned > 0 && (<><span>·</span><RewardTooltip earned={postEarned} kind="community_post" /></>)}
              {isAuthor && (<><span>·</span><PostActions postId={post.id} basePath="/stocks" /></>)}
            </div>
          </header>

          {post.stock_code && /^\d{6}$/.test(post.stock_code) && (
            <div className="mb-6">
              <StockInfoCard code={post.stock_code} />
            </div>
          )}

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
            postCategory="community"
          />

          <div className="mt-10 pt-6 border-t border-border flex justify-between items-center">
            <Link href="/stocks" className="text-[13px] font-bold text-navy no-underline hover:underline">
              ← 목록으로
            </Link>
          </div>
        </div>
      </article>
    </Layout>
  );
}
