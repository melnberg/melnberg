import Link from 'next/link';
import { notFound } from 'next/navigation';
import Layout from '@/components/Layout';
import MainTop from '@/components/MainTop';
import CommentSection from '@/components/CommentSection';
import PostActions from '@/components/PostActions';
import Nickname from '@/components/Nickname';
import { getPost, listComments, formatRelativeKo } from '@/lib/community';
import { createClient } from '@/lib/supabase/server';
import { linkify } from '@/lib/linkify';
import { profileToNicknameInfo } from '@/lib/nickname-info';

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
  // 조회수 +1 (RLS 우회 RPC). 실패해도 페이지 렌더는 계속.
  void supabase.rpc('increment_post_view', { p_post_id: numId }).then(() => {}, () => {});
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
                  <PostActions postId={post.id} />
                </>
              )}
            </div>
          </header>

          {/* 본문 — 글 안의 URL 은 자동 링크 변환 */}
          <div className="text-[15px] leading-loose break-keep whitespace-pre-wrap mb-12">
            {linkify(post.content)}
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
          </div>
        </div>
      </article>

    </Layout>
  );
}
