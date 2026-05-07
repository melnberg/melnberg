import { createClient } from './supabase/server';

export type Stock = {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  active: boolean;
};

export async function listStocks(): Promise<Stock[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('stocks')
    .select('code, name, market, active')
    .eq('active', true)
    .order('market', { ascending: true })
    .order('name', { ascending: true });
  return (data ?? []) as Stock[];
}

export async function getStock(code: string): Promise<Stock | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('stocks')
    .select('code, name, market, active')
    .eq('code', code)
    .maybeSingle();
  return (data as Stock) ?? null;
}

// 특정 종목의 글 목록 + 댓글 수
export async function listStockPosts(stockCode: string, limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('posts')
    .select('id, author_id, title, content, created_at, view_count, like_count, author:profiles!author_id(display_name, link_url, tier, tier_expires_at, is_solo, avatar_url), comments(count)')
    .eq('category', 'stocks')
    .eq('stock_code', stockCode)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  type Row = {
    id: number; author_id: string; title: string; content: string; created_at: string;
    view_count: number | null; like_count: number | null;
    author: { display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null; avatar_url: string | null } | null;
    comments?: Array<{ count: number }>;
  };
  return ((data ?? []) as Row[]).map((p) => ({ ...p, comment_count: p.comments?.[0]?.count ?? 0 }));
}
