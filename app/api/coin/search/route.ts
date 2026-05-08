// 코인 검색 — Upbit /v1/market/all 의 KRW 마켓에서 한국명/영문명/심볼로 매칭.
// GET /api/coin/search?q=비트코인  →  [{code:'KRW-BTC', name:'비트코인', english:'Bitcoin'}, ...]

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

type UpbitMarket = { market: string; korean_name: string; english_name: string };

let cache: { ts: number; data: UpbitMarket[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h

async function loadAll(): Promise<UpbitMarket[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.data;
  try {
    const r = await fetch('https://api.upbit.com/v1/market/all?isDetails=false', { cache: 'no-store' });
    if (!r.ok) return cache?.data ?? [];
    const j = (await r.json()) as UpbitMarket[];
    // KRW 마켓만 — BTC/USDT 페어는 제외 (멜른버그 사용자는 KRW 시세 위주)
    const krw = j.filter((m) => m.market.startsWith('KRW-'));
    cache = { ts: Date.now(), data: krw };
    return krw;
  } catch {
    return cache?.data ?? [];
  }
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ items: [] });
  const all = await loadAll();
  const ql = q.toLowerCase();
  const items: Array<{ code: string; name: string; english: string }> = [];
  for (const m of all) {
    const sym = m.market.replace('KRW-', '');
    if (
      m.korean_name.includes(q) ||
      m.english_name.toLowerCase().includes(ql) ||
      sym.toLowerCase().includes(ql)
    ) {
      items.push({ code: m.market, name: m.korean_name, english: m.english_name });
      if (items.length >= 30) break;
    }
  }
  return NextResponse.json({ items });
}
