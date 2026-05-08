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
import StockInfoCard from '@/components/StockInfoCard';
import { getPost, listComments, formatRelativeKo } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';
import { linkify } from '@/lib/linkify';
import { profileToNicknameInfo } from '@/lib/nickname-info';
import { fetchPostPoll } from '@/lib/post-poll';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id), 'coin');
  if (!post) return {};
  return {
    title: `${post.title} — 코인 토론 — 멜른버그`,
    description: post.content.slice(0, 140),
  };
}

export default async function CoinPostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const [post, comments] = await Promise.all([getPost(numId, 'coin'), listComments(numId)]);
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
      <Layout current="coin">
        <MainTop crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/coin', label: '코인 토론' },
          { label: '삭제된 글', bold: true },
        ]} meta="Deleted" />
        <article className="py-24">
          <div className="max-w-[520px] mx-auto px-6 text-center">
            <h1 className="text-[22px] font-bold text-navy mb-3">게시글이 삭제되었습니다</h1>
            <Link href="/coin" className="inline-block bg-cyan text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-cyan/80">
              ← 코인 토론 목록
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
    <Layout current="coin">
      <PostViewCounter postId={post.id} />
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/coin', label: '코인 토론' },
        { label: post.title, bold: true },
      ]} meta="Coin" />

      <div className="relative" style={{ background: 'linear-gradient(180deg, #0a0612 0%, #18102b 60%, #1f1438 100%)' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-20 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
               style={{ background: 'radial-gradient(circle, #f7931a55, transparent 70%)' }} />
          <div className="absolute top-20 right-0 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl"
               style={{ background: 'radial-gradient(circle, #b85cff55, transparent 70%)' }} />
        </div>

        <article className="relative pt-10 pb-16">
          <div className="max-w-[760px] mx-auto px-6">
            <header className="pb-6 mb-6 border-b border-white/15">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-block text-[10px] font-bold tracking-widest uppercase px-2 py-0.5"
                        style={{ background: 'rgba(247,147,26,0.15)', border: '1px solid rgba(247,147,26,0.4)', color: '#ffb866' }}>₿ COIN</span>
                  {(post.stock_name || post.stock_code) && (
                    <span className="inline-block text-[11px] font-bold px-2 py-0.5"
                          style={{ background: 'rgba(247,147,26,0.12)', border: '1px solid rgba(247,147,26,0.3)', color: '#ffd6a3' }}>
                      {post.stock_name || (post.stock_code ? post.stock_code.replace('KRW-', '') : '')}
                    </span>
                  )}
                </div>
                <PostLikeButton postId={post.id} initialCount={post.like_count ?? 0} />
              </div>
              <h1 className="text-[28px] lg:text-[34px] font-black text-white tracking-tight leading-tight mb-3 break-keep"
                  style={{ textShadow: '0 0 30px rgba(247,147,26,0.3)' }}>{post.title}</h1>
              <div className="flex items-center gap-3 text-[12px] flex-wrap" style={{ color: '#fde68a' }}>
                <span className="font-bold">
                  <Nickname info={profileToNicknameInfo(post.author, post.author_id)} />
                </span>
                <span className="text-white/40">·</span>
                <span className="text-white/60">{formatRelativeKo(post.created_at)}</span>
                {post.updated_at !== post.created_at && (<><span className="text-white/40">·</span><span className="text-white/60">수정됨</span></>)}
                {postEarned > 0 && (<><span className="text-white/40">·</span><RewardTooltip earned={postEarned} kind="community_post" /></>)}
                {isAuthor && (<><span className="text-white/40">·</span><PostActions postId={post.id} basePath="/coin" /></>)}
              </div>
            </header>

            {post.stock_code && /^KRW-[A-Z0-9]{2,10}$/.test(post.stock_code) && (
              <div className="mb-6">
                <StockInfoCard code={post.stock_code} kind="coin" theme="dark" />
              </div>
            )}

            <div className="px-6 lg:px-8 py-8 border border-white/10 mb-3"
                 style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012))', backdropFilter: 'blur(6px)' }}>
              <div className="text-[15px] leading-loose break-keep whitespace-pre-wrap text-white/90">
                {linkify(post.content)}
              </div>
            </div>

            <div className="dark-section px-6 lg:px-8 py-6 border border-white/10"
                 style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012))', backdropFilter: 'blur(6px)' }}>
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

              <CommentSection
                postId={post.id}
                comments={comments}
                currentUserId={user?.id ?? null}
                currentUserName={currentUserName}
                postCategory="community"
              />
            </div>

            <div className="mt-8 flex justify-between items-center">
              <Link href="/coin" className="text-[13px] font-bold text-amber-200 no-underline hover:text-amber-100">
                ← 목록으로
              </Link>
            </div>
          </div>
        </article>
      </div>
    </Layout>
  );
}
