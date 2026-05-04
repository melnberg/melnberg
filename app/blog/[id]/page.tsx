import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import CommentSection from '@/components/CommentSection';
import PostActions from '@/components/PostActions';
import {
  getPost,
  listComments,
  formatRelativeKo,
  isCurrentUserAdmin,
  getCurrentUserAccess,
  canViewPaidContent,
} from '@/lib/community';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id), 'blog');
  if (!post) return {};
  return {
    title: `${post.title} — 멜른버그`,
    description: post.content.slice(0, 140),
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  const [post, comments, isAdmin, access] = await Promise.all([
    getPost(numId, 'blog'),
    listComments(numId),
    isCurrentUserAdmin(),
    getCurrentUserAccess(),
  ]);
  if (!post) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthor = user?.id === post.author_id;
  const locked = post.is_paid_only && !canViewPaidContent(access);

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

  return (
    <Layout current="blog">
      <MainTop
        crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/blog', label: '블로그' },
          { label: post.title, bold: true },
        ]}
        meta="Blog"
      />

      <article className="py-12">
        <div className="max-w-[760px] mx-auto px-6">
          <header className="pb-6 mb-6 border-b border-border">
            <h1 className="text-[28px] font-bold text-navy tracking-tight leading-tight mb-3 break-keep">
              {post.is_paid_only && (
                <span className="inline-block bg-cyan/15 text-navy text-[12px] font-bold px-2 py-0.5 mr-2 align-middle tracking-wide">
                  조합원
                </span>
              )}
              {post.title}
            </h1>
            <div className="flex items-center gap-3 text-[12px] text-muted flex-wrap">
              <span className="font-bold text-navy">{post.author?.display_name ?? '익명'}</span>
              <span>·</span>
              <span>{formatRelativeKo(post.created_at)}</span>
              {post.updated_at !== post.created_at && (
                <>
                  <span>·</span>
                  <span>수정됨</span>
                </>
              )}
              {isAuthor && (
                <>
                  <span>·</span>
                  <PostActions postId={post.id} basePath="/blog" />
                </>
              )}
            </div>
          </header>

          {locked ? (
            <div className="text-[13px] text-muted text-center py-16 mb-12 border-y border-border">
              조합원 전용임.
            </div>
          ) : (
            <>
              <div className="text-[15px] leading-loose break-keep whitespace-pre-wrap mb-12">
                {post.content}
              </div>

              <CommentSection
                postId={post.id}
                comments={comments}
                currentUserId={user?.id ?? null}
                currentUserName={currentUserName}
              />
            </>
          )}

          <div className="mt-10 pt-6 border-t border-border flex justify-between items-center">
            <Link href="/blog" className="text-[13px] font-bold text-navy no-underline hover:underline">
              ← 목록으로
            </Link>
            {isAdmin && (
              <Link href="/blog/new" className="bg-navy text-white px-4 py-2 text-[12px] font-bold tracking-wider no-underline hover:bg-navy-dark">
                글쓰기 →
              </Link>
            )}
          </div>
        </div>
      </article>

    </Layout>
  );
}
