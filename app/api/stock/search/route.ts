// 종목 검색 — Naver 종목 자동완성 API.
// GET /api/stock/search?q=삼성

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ items: [] });

  // Naver 자동완성 — 한글/영문/코드 모두 지원
  const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(q)}&t_koreng=1&st=111&r_format=json&r_enc=UTF-8&q_enc=UTF-8&r_lt=111&r_unicode=0&r_escape=1`;
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return NextResponse.json({ items: [] });
    const j = (await r.json()) as { items?: Array<Array<Array<string>>> };
    // 응답 구조: { items: [ [['삼성전자', ...], ['005930'], ...], ... ] }
    // 각 그룹의 첫 항목 [name], 둘째 [code], 셋째 [type] 정도
    const items: Array<{ code: string; name: string; market?: string }> = [];
    const groups = j.items ?? [];
    for (const g of groups) {
      for (const row of g) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const name = row[0]?.replace(/<[^>]+>/g, '').trim();
        const code = row[1]?.replace(/<[^>]+>/g, '').trim();
        if (!name || !code) continue;
        if (!/^\d{6}$/.test(code)) continue; // 6자리 종목코드만
        const market = row[2]?.replace(/<[^>]+>/g, '').trim();
        // 중복 제거
        if (items.find((x) => x.code === code)) continue;
        items.push({ code, name, market });
      }
    }
    return NextResponse.json({ items: items.slice(0, 20) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
