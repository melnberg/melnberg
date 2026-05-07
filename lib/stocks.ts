import { createClient } from './supabase/server';

export type Stock = {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  active: boolean;
};

export type StockWithPrice = Stock & {
  latest_trade_date: string | null;
  latest_close: number | null;
  latest_change_amount: number | null;
  latest_change_pct: number | null;
  latest_volume: number | null;
};

// 시세 view 사용 — 종목 + 최신 종가 한 번에
export async function listStocks(): Promise<StockWithPrice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('stocks_with_latest_price')
    .select('code, name, market, active, latest_trade_date, latest_close, latest_change_amount, latest_change_pct, latest_volume')
    .eq('active', true)
    .order('market', { ascending: true })
    .order('name', { ascending: true });
  return (data ?? []) as StockWithPrice[];
}

export async function getStock(code: string): Promise<StockWithPrice | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('stocks_with_latest_price')
    .select('code, name, market, active, latest_trade_date, latest_close, latest_change_amount, latest_change_pct, latest_volume')
    .eq('code', code)
    .maybeSingle();
  return (data as StockWithPrice) ?? null;
}

// 종목 최근 N일 시세 (mini chart 용)
export async function getPriceHistory(code: string, days = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('stock_prices')
    .select('trade_date, close, change_pct')
    .eq('code', code)
    .order('trade_date', { ascending: false })
    .limit(days);
  return (data ?? []).reverse() as Array<{ trade_date: string; close: number; change_pct: number | null }>;
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
  return ((data ?? []) as unknown as Row[]).map((p) => ({ ...p, comment_count: p.comments?.[0]?.count ?? 0 }));
}
