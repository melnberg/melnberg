import { createClient } from './supabase/server';

export type PostCategory = 'community' | 'blog';

export type CommunityPost = {
  id: number;
  author_id: string;
  title: string;
  content: string;
  category: PostCategory;
  created_at: string;
  updated_at: string;
  author: { display_name: string | null } | null;
  comment_count?: number;
  view_count?: number;
  like_count?: number;
};

export type CommunityComment = {
  id: number;
  post_id: number;
  author_id: string;
  content: string;
  created_at: string;
  author: { display_name: string | null } | null;
};

export async function listPosts(category: PostCategory = 'community', limit = 50): Promise<CommunityPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('posts')
    .select('id, author_id, title, content, category, created_at, updated_at, author:profiles!author_id(display_name), comments(count)')
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listPosts error', error);
    return [];
  }
  return (data ?? []).map((p: Record<string, unknown>) => {
    const commentsArr = p.comments as Array<{ count: number }> | undefined;
    const commentCount = commentsArr?.[0]?.count ?? 0;
    const { comments, ...rest } = p;
    void comments;
    return { ...rest, comment_count: commentCount } as CommunityPost;
  });
}

export async function getPost(id: number, category?: PostCategory): Promise<CommunityPost | null> {
  const supabase = await createClient();
  let q = supabase
    .from('posts')
    .select('id, author_id, title, content, category, created_at, updated_at, author:profiles!author_id(display_name)')
    .eq('id', id);
  if (category) q = q.eq('category', category);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return data as unknown as CommunityPost;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  return Boolean(data?.is_admin);
}

export async function listComments(postId: number): Promise<CommunityComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, author_id, content, created_at, author:profiles!author_id(display_name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listComments error', error);
    return [];
  }
  return (data ?? []) as unknown as CommunityComment[];
}

export function formatRelativeKo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '방금 전';
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}일 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// SLRClub 스타일: 오늘이면 HH:MM:SS, 아니면 YYYY.MM.DD
export function formatBoardTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
