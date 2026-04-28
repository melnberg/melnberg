import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import Footer from '@/components/Footer';
import CommentSection from '@/components/CommentSection';
import PostActions from '@/components/PostActions';
import { getPost, listComments, formatRelativeKo } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(Number(id));
  if (!post) return {};
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

  const supabase = await createClient();
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

  return (
    <Layout current="community">
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
            <h1 className="text-[28px] font-bold text-navy tracking-tight leading-tight mb-3 break-keep">{post.title}</h1>
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
                  <PostActions postId={post.id} />
                </>
              )}
            </div>
          </header>

          {/* 본문 */}
          <div className="text-[15px] leading-loose break-keep whitespace-pre-wrap mb-12">
            {post.content}
          </div>

          {/* 댓글 */}
          <CommentSection
            postId={post.id}
            comments={comments}
            currentUserId={user?.id ?? null}
            currentUserName={currentUserName}
          />

          {/* 목록으로 */}
          <div className="mt-10 pt-6 border-t border-border flex justify-between items-center">
            <Link
              href="/community"
              className="text-[13px] font-bold text-navy no-underline hover:underline"
            >
              ← 목록으로
            </Link>
            {user && (
              <Link
                href="/community/new"
                className="bg-navy text-white px-4 py-2 text-[12px] font-bold tracking-wider no-underline hover:bg-navy-dark"
              >
                글쓰기 →
              </Link>
            )}
          </div>
        </div>
      </article>

      <Footer />
    </Layout>
  );
}
