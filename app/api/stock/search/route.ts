// 종목 검색 — 여러 엔드포인트 시도 + 로컬 DB fallback.
// GET /api/stock/search?q=삼성

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

type Item = { code: string; name: string; market?: string };

// 1) Naver mobile front-api 검색 (가장 안정적)
async function searchNaverFront(q: string): Promise<Item[]> {
  try {
    const url = `https://m.stock.naver.com/front-api/v1/search/autoComplete?searchTerm=${encodeURIComponent(q)}&target=stock`;
    const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const j = (await r.json()) as { result?: { items?: Array<{ reutersCode?: string; name?: string; nationCode?: string; nationName?: string; typeName?: string }> } };
    const list = j.result?.items ?? [];
    const items: Item[] = [];
    for (const it of list) {
      const code = (it.reutersCode ?? '').replace(/[^0-9]/g, '');
      if (!/^\d{6}$/.test(code)) continue;
      if (!it.name) continue;
      items.push({ code, name: it.name, market: it.typeName ?? it.nationName ?? '' });
    }
    return items;
  } catch { return []; }
}

// 2) 로컬 DB stocks 테이블 검색 — anon public client (stores 패턴, 154/164 RLS 가 anon select 허용)
async function searchLocalDb(q: string): Promise<Item[]> {
  try {
    const sb = createPublicClient();
    const isCode = /^\d{1,6}$/.test(q);
    const query = sb.from('stocks').select('code, name, market').eq('active', true);
    const { data, error } = isCode
      ? await query.ilike('code', `${q}%`).limit(20)
      : await query.ilike('name', `%${q}%`).limit(20);
    if (error) console.error('stocks search fallback error:', error);
    return (data ?? []) as Item[];
  } catch (e) {
    console.error('stocks search fallback exception:', e);
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ items: [] });

  // Naver front-api 우선, 실패 시 로컬 DB
  let items = await searchNaverFront(q);
  if (items.length === 0) items = await searchLocalDb(q);

  // 6자리 코드 직접 입력 — 검색 결과 없어도 그 코드 자체를 후보로
  if (items.length === 0 && /^\d{6}$/.test(q)) {
    items = [{ code: q, name: q, market: '' }];
  }

  return NextResponse.json({ items: items.slice(0, 20) });
}
