import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import CommentSection from '@/components/CommentSection';
import PostActions from '@/components/PostActions';
import Nickname from '@/components/Nickname';
import {
  getPost,
  listComments,
  formatRelativeKo,
  isCurrentUserAdmin,
  getCurrentUserAccess,
  canViewPaidContent,
} from '@/lib/community';
import { createClient } from '@/lib/supabase/server';
import { linkify } from '@/lib/linkify';
import { profileToNicknameInfo } from '@/lib/nickname-info';

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
  if (post.deleted_at) {
    return (
      <Layout current="blog">
        <MainTop crumbs={[
          { href: '/', label: '멜른버그' },
          { href: '/blog', label: '블로그' },
          { label: '삭제된 글', bold: true },
        ]} meta="Deleted" />
        <article className="py-24">
          <div className="max-w-[520px] mx-auto px-6 text-center">
            <div className="text-[14px] font-bold tracking-wider uppercase text-muted mb-4">DELETED</div>
            <h1 className="text-[22px] font-bold text-navy mb-3">게시글이 삭제되었습니다</h1>
            <p className="text-[13px] text-muted leading-relaxed mb-8">작성자가 이 글을 삭제했어요.</p>
            <Link href="/blog" className="inline-block bg-navy text-white px-6 py-3 text-[13px] font-bold tracking-wide no-underline hover:bg-navy-dark">
              ← 블로그 목록
            </Link>
          </div>
        </article>
      </Layout>
    );
  }

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
                {linkify(post.content)}
              </div>

              <CommentSection
                postId={post.id}
                comments={comments}
                currentUserId={user?.id ?? null}
                currentUserName={currentUserName}
                postCategory="blog"
              />
            </>
          )}

          <div className="mt-10 pt-6 border-t border-border flex justify-between items-center">
            <Link href="/blog" className="text-[13px] font-bold text-navy no-underline hover:underline">
              ← 목록으로
            </Link>
          </div>
        </div>
      </article>

    </Layout>
  );
}
