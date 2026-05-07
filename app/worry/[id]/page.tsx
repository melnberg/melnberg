import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import CommentSection from '@/components/CommentSection';
import PostActions from '@/components/PostActions';
import PostViewCounter from '@/components/PostViewCounter';
import RewardTooltip from '@/components/RewardTooltip';
import PostLikeButton from '@/components/PostLikeButton';
import { getPost, listComments, formatRelativeKo } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';
import { linkify } from '@/lib/linkify';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id), 'worry');
  if (!post) return {};
  return {
    title: `${post.title} — 익명 고민상담 — 멜른버그`,
    description: post.content.slice(0, 140),
  };
}

export default async function WorryPostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const [post, comments] = await Promise.all([getPost(numId, 'worry'), listComments(numId)]);
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
      <Layout current="worry">
        <MainTop crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/worry', label: '익명 고민상담' },
          { label: '삭제된 글', bold: true },
        ]} meta="Deleted" />
        <article className="py-24">
          <div className="max-w-[520px] mx-auto px-6 text-center">
            <h1 className="text-[22px] font-bold text-navy mb-3">게시글이 삭제되었습니다</h1>
            <Link href="/worry" className="inline-block bg-cyan text-navy px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-cyan/80">
              ← 익명 고민상담 목록
            </Link>
          </div>
        </article>
      </Layout>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthor = user?.id === post.author_id;

  // worry 게시판은 댓글 작성자도 익명으로 표시. CommentSection 에 currentUserName="익명" 전달.
  const currentUserName: string | null = user ? '익명' : null;

  return (
    <Layout current="worry">
      <PostViewCounter postId={post.id} />
      <MainTop crumbs={[
        { href: '/', label: '멜른버그' },
        { href: '/worry', label: '익명 고민상담' },
        { label: post.title, bold: true },
      ]} meta="Worry" />

      <article className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <header className="pb-6 mb-6 border-b border-cyan/30">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-block bg-cyan/10 text-navy text-[10px] font-bold tracking-widest uppercase px-2 py-0.5">💬 WORRY</span>
              </div>
              <PostLikeButton postId={post.id} initialCount={post.like_count ?? 0} />
            </div>
            <h1 className="text-[28px] font-bold text-navy tracking-tight leading-tight mb-3 break-keep">{post.title}</h1>
            <div className="flex items-center gap-3 text-[12px] text-muted flex-wrap">
              <span className="font-bold text-muted">익명</span>
              <span>·</span>
              <span>{formatRelativeKo(post.created_at)}</span>
              {post.updated_at !== post.created_at && (<><span>·</span><span>수정됨</span></>)}
              {postEarned > 0 && (<><span>·</span><RewardTooltip earned={postEarned} kind="community_post" /></>)}
              {isAuthor && (<><span>·</span><PostActions postId={post.id} basePath="/worry" /></>)}
            </div>
          </header>

          <div className="text-[15px] leading-loose break-keep whitespace-pre-wrap mb-12">
            {linkify(post.content)}
          </div>

          <CommentSection
            postId={post.id}
            comments={comments}
            currentUserId={user?.id ?? null}
            currentUserName={currentUserName}
            postCategory="worry"
          />

          <div className="mt-10 pt-6 border-t border-border flex justify-between items-center">
            <Link href="/worry" className="text-[13px] font-bold text-navy no-underline hover:underline">
              ← 목록으로
            </Link>
          </div>
        </div>
      </article>
    </Layout>
  );
}
