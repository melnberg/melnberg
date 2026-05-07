// Naver 금융에서 종목 통합 정보 가져옴 — 가격, 등락, 시총, PER, 일별 추이.
// GET /api/stock/info?code=005930

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type NaverInfo = {
  itemCode: string;
  stockName: string;
  totalInfos?: Array<{ code: string; key: string; value: string; compareToPreviousPrice?: { name: string } }>;
  dealTrendInfos?: Array<{ bizdate: string; closePrice: string; compareToPreviousClosePrice: string; compareToPreviousPrice: { name: string }; accumulatedTradingVolume: string }>;
};

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '6자리 종목 코드 필요' }, { status: 400 });
  }
  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) return NextResponse.json({ error: `Naver ${r.status}` }, { status: 502 });
    const j = (await r.json()) as NaverInfo;

    // totalInfos 를 key 기반 map 으로 변환
    const map = new Map<string, string>();
    for (const t of j.totalInfos ?? []) map.set(t.code, t.value);

    // dealTrendInfos → 차트용 데이터 (최근 → 오래된 순서로 옴, reverse 해서 시간순)
    const history = (j.dealTrendInfos ?? []).map((d) => ({
      date: `${d.bizdate.slice(0, 4)}-${d.bizdate.slice(4, 6)}-${d.bizdate.slice(6, 8)}`,
      close: Number(d.closePrice.replace(/,/g, '')),
      change: Number(d.compareToPreviousClosePrice.replace(/[+,]/g, '')),
      direction: d.compareToPreviousPrice?.name ?? null,
      volume: Number(d.accumulatedTradingVolume.replace(/,/g, '')),
    })).reverse();

    return NextResponse.json({
      ok: true,
      code: j.itemCode,
      name: j.stockName,
      // 현재가는 가장 최근 dealTrend 의 close
      price: history.length > 0 ? history[history.length - 1].close : null,
      lastClose: Number((map.get('lastClosePrice') ?? '0').replace(/,/g, '')) || null,
      open: Number((map.get('openPrice') ?? '0').replace(/,/g, '')) || null,
      high: Number((map.get('highPrice') ?? '0').replace(/,/g, '')) || null,
      low: Number((map.get('lowPrice') ?? '0').replace(/,/g, '')) || null,
      volume: map.get('accumulatedTradingVolume') ?? null,
      marketCap: map.get('marketValue') ?? null,
      foreignRate: map.get('foreignRate') ?? null,
      per: map.get('per') ?? null,
      eps: map.get('eps') ?? null,
      pbr: map.get('pbr') ?? null,
      dividendYield: map.get('dividendYieldRatio') ?? null,
      high52: Number((map.get('highPriceOf52Weeks') ?? '0').replace(/,/g, '')) || null,
      low52: Number((map.get('lowPriceOf52Weeks') ?? '0').replace(/,/g, '')) || null,
      history,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'fetch 실패' }, { status: 502 });
  }
}
