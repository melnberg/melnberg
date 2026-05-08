// 종목 검색 — Naver autoComplete 다중 target (한국주식 + 미국주식 + ETF) + 로컬 DB fallback.
// GET /api/stock/search?q=삼성

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

type Item = { code: string; name: string; market?: string };

// Naver autoComplete — target 별 호출. 'stock' (한국주식), 'ushare' (미국주식), 'etf' (한국ETF), 'index' (지수)
// API 실험상 target 콤마 multi 는 일부만 받음 → 안전하게 4번 병렬 호출 후 결과 합침.
async function searchNaverTarget(q: string, target: string): Promise<Item[]> {
  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=${target}`;
    const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const j = (await r.json()) as { items?: Array<{ code?: string; reutersCode?: string; name?: string; nationName?: string; typeName?: string; category?: string }> };
    const list = j.items ?? [];
    const items: Item[] = [];
    for (const it of list) {
      // category 가 stock/ushare/etf/jshare/hshare 등 다양 — 그냥 받아들임 (target 자체로 분류됨)
      const raw = (it.code ?? it.reutersCode ?? '').trim();
      if (!raw || !it.name) continue;
      // 한국 주식/ETF — 6자리 숫자, 미국 주식 — 알파벳 ticker. raw 가 둘 중 하나면 OK.
      const isKr = /^\d{6}$/.test(raw);
      const isUs = /^[A-Z][A-Z0-9.\-]{0,9}$/i.test(raw);
      if (!isKr && !isUs) continue;
      const market = it.typeName ?? it.nationName ?? (isKr ? (target === 'etf' ? 'ETF' : '국내') : '미국');
      items.push({ code: raw.toUpperCase(), name: it.name, market });
    }
    return items;
  } catch (e) {
    console.error(`naver autoComplete (${target}) error:`, e);
    return [];
  }
}

async function searchNaverFront(q: string): Promise<Item[]> {
  // 4개 target 병렬 — 빠르고 결과 풍부.
  const [stock, ushare, etf] = await Promise.all([
    searchNaverTarget(q, 'stock'),
    searchNaverTarget(q, 'ushare'),
    searchNaverTarget(q, 'etf'),
  ]);
  // dedupe by code (한국주식/ETF 중복 가능성 — 같은 6자리 코드)
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const it of [...stock, ...ushare, ...etf]) {
    if (seen.has(it.code)) continue;
    seen.add(it.code);
    out.push(it);
  }
  return out;
}

// 로컬 DB stocks 테이블 검색 — Naver 다 실패 시
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

  let items = await searchNaverFront(q);
  if (items.length === 0) items = await searchLocalDb(q);

  // 6자리 코드 직접 입력 — 검색 결과 없어도 그 코드 자체를 후보로
  if (items.length === 0 && /^\d{6}$/.test(q)) {
    items = [{ code: q, name: q, market: '' }];
  }
  // 미국 ticker 직접 입력 — 마찬가지로 후보로
  if (items.length === 0 && /^[A-Z]{1,5}$/i.test(q)) {
    items = [{ code: q.toUpperCase(), name: q.toUpperCase(), market: '미국' }];
  }

  return NextResponse.json({ items: items.slice(0, 30) });
}
