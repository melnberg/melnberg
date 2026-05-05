import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabase = createPublicClient();

  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('id, author_id, title, category, deleted_at, created_at')
    .eq('category', 'community')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: comments, error: commentsErr } = await supabase
    .from('comments')
    .select('id, post_id, author_id, content, deleted_at, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  let commentPosts: unknown = null;
  if (comments && comments.length > 0) {
    const ids = Array.from(new Set((comments as Array<{ post_id: number }>).map((c) => c.post_id)));
    const { data } = await supabase.from('posts').select('id, title, category, deleted_at').in('id', ids);
    commentPosts = data;
  }

  return NextResponse.json({
    now: new Date().toISOString(),
    posts: { count: posts?.length ?? 0, error: postsErr?.message ?? null, sample: posts?.slice(0, 5) ?? [] },
    comments: { count: comments?.length ?? 0, error: commentsErr?.message ?? null, sample: comments?.slice(0, 5) ?? [] },
    commentPosts,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
