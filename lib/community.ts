import { createClient } from './supabase/server';

export type CommunityPost = {
  id: number;
  author_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  author: { display_name: string | null } | null;
};

export type CommunityComment = {
  id: number;
  post_id: number;
  author_id: string;
  content: string;
  created_at: string;
  author: { display_name: string | null } | null;
};

export async function listPosts(limit = 50): Promise<CommunityPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('posts')
    .select('id, author_id, title, content, created_at, updated_at, author:profiles!author_id(display_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listPosts error', error);
    return [];
  }
  return (data ?? []) as unknown as CommunityPost[];
}

export async function getPost(id: number): Promise<CommunityPost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('posts')
    .select('id, author_id, title, content, created_at, updated_at, author:profiles!author_id(display_name)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as CommunityPost;
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
