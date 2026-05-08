// 종목 통합 정보 — 한국/미국 양쪽 모두 지원.
// - 한국 (6자리 숫자): m.stock.naver.com/api/stock/{code}/integration
// - 미국 (알파벳 ticker): api.stock.naver.com/stock/{ticker[.O|.K|.N]}/basic
//   · suffix 미상 → 평문 → .O → .K → .N 순서 시도
//   · 차트 — api.stock.naver.com/chart/foreign/item/{reutersCode}/day?startDateTime=...&endDateTime=...
// GET /api/stock/info?code=005930  또는  /api/stock/info?code=AAPL

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type NaverKrInfo = {
  itemCode: string;
  stockName: string;
  stockEndType?: string;
  totalInfos?: Array<{ code: string; key: string; value: string; compareToPreviousPrice?: { name: string } }>;
  dealTrendInfos?: Array<{ bizdate: string; closePrice: string; compareToPreviousClosePrice: string; compareToPreviousPrice: { name: string }; accumulatedTradingVolume: string }>;
};

type NaverUsBasic = {
  reutersCode: string;
  stockName: string;
  stockNameEng?: string;
  symbolCode?: string;
  closePrice?: string;
  compareToPreviousClosePrice?: string;
  fluctuationsRatio?: string;
  marketStatus?: string;
  localTradedAt?: string;
  stockExchangeType?: { nameKor?: string; name?: string; nationName?: string; nationCode?: string };
  industryCodeType?: { industryGroupKor?: string };
  currencyType?: { code?: string };
  stockItemTotalInfos?: Array<{ code: string; key: string; value: string }>;
  overMarketPriceInfo?: {
    overPrice?: string;
    compareToPreviousClosePrice?: string;
    fluctuationsRatio?: string;
    compareToPreviousPrice?: { name?: string };
    tradingSessionType?: string;
  };
};

type UsChartRow = { localDate: string; closePrice: number; openPrice: number; highPrice: number; lowPrice: number; accumulatedTradingVolume: number };

const US_SUFFIXES = ['', '.O', '.K', '.N'];

async function fetchUsBasic(ticker: string): Promise<{ reutersCode: string; data: NaverUsBasic } | null> {
  for (const suf of US_SUFFIXES) {
    const code = `${ticker}${suf}`;
    try {
      const r = await fetch(`https://api.stock.naver.com/stock/${code}/basic`, {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!r.ok) continue;
      const j = (await r.json()) as NaverUsBasic & { code?: string; message?: string };
      if (!j || (j as { code?: string }).code === 'StockConflict') continue;
      if (!j.reutersCode) continue;
      return { reutersCode: j.reutersCode, data: j };
    } catch {
      // 다음 suffix 시도
    }
  }
  return null;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${dd}`;
}

async function fetchUsHistory(reutersCode: string): Promise<UsChartRow[]> {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 90); // 약 3개월 영업일 ≈ 60개
  const url = `https://api.stock.naver.com/chart/foreign/item/${reutersCode}/day?startDateTime=${toYmd(from)}000000&endDateTime=${toYmd(now)}235959`;
  try {
    const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return [];
    const j = await r.json();
    if (!Array.isArray(j)) return [];
    return j as UsChartRow[];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: '종목 코드 필요' }, { status: 400 });

  // 미국 ticker (알파벳, 1~10자, .O/.K 같은 suffix 허용)
  if (/^[A-Z][A-Z0-9.\-]{0,9}$/i.test(code)) {
    const ticker = code.toUpperCase();
    const fetched = await fetchUsBasic(ticker);
    if (!fetched) {
      return NextResponse.json({ error: `미국 종목 시세 없음 (${ticker} — 상장폐지/심볼변경 가능)` }, { status: 502 });
    }
    const { reutersCode, data: b } = fetched;
    // totalInfos → key map
    const m = new Map<string, string>();
    for (const t of b.stockItemTotalInfos ?? []) m.set(t.code, t.value);

    const num = (s: string | undefined): number | null => {
      if (!s) return null;
      const n = Number(s.replace(/,/g, ''));
      return isFinite(n) ? n : null;
    };

    // 차트 — yyyymmdd → yyyy-mm-dd
    const chart = await fetchUsHistory(reutersCode);
    const history = chart.map((c) => {
      // 종가 비교 — 직전 행과 비교
      return {
        date: `${c.localDate.slice(0, 4)}-${c.localDate.slice(4, 6)}-${c.localDate.slice(6, 8)}`,
        close: c.closePrice,
        open: c.openPrice,
        high: c.highPrice,
        low: c.lowPrice,
        change: 0, // 이후 채움
        direction: null as string | null,
        volume: c.accumulatedTradingVolume,
      };
    });
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1].close;
      const cur = history[i].close;
      history[i].change = cur - prev;
      history[i].direction = cur > prev ? 'RISING' : cur < prev ? 'FALLING' : 'EVEN';
    }

    const lastClose = history.length >= 2 ? history[history.length - 2].close : null;
    const price = num(b.closePrice) ?? (history.length > 0 ? history[history.length - 1].close : null);

    // 시간외 (프리/애프터) — overMarketPriceInfo
    const after = b.overMarketPriceInfo
      ? {
          price: num(b.overMarketPriceInfo.overPrice),
          change: num(b.overMarketPriceInfo.compareToPreviousClosePrice),
          ratio: num(b.overMarketPriceInfo.fluctuationsRatio),
          direction: b.overMarketPriceInfo.compareToPreviousPrice?.name ?? null,
          session: b.overMarketPriceInfo.tradingSessionType ?? null,
        }
      : null;

    return NextResponse.json({
      ok: true,
      code: b.symbolCode ?? ticker,
      reutersCode,
      name: b.stockName,
      nameEng: b.stockNameEng ?? null,
      foreign: true,
      currency: b.currencyType?.code ?? 'USD',
      exchange: b.stockExchangeType?.name ?? null,
      exchangeKor: b.stockExchangeType?.nameKor ?? null,
      nation: b.stockExchangeType?.nationName ?? '미국',
      industry: b.industryCodeType?.industryGroupKor ?? null,
      marketStatus: b.marketStatus ?? null,
      localTradedAt: b.localTradedAt ?? null,
      price,
      lastClose,
      open: num(m.get('openPrice')),
      high: num(m.get('highPrice')),
      low: num(m.get('lowPrice')),
      volume: m.get('accumulatedTradingVolume') ?? null,
      tradingValue: m.get('accumulatedTradingValue') ?? null,
      marketCap: m.get('marketValue') ?? null,
      foreignRate: null, // 미국주식엔 외인비중 개념 없음
      per: m.get('per') ?? null,
      eps: m.get('eps') ?? null,
      pbr: m.get('pbr') ?? null,
      bps: m.get('bps') ?? null,
      dividend: m.get('dividend') ?? null,
      dividendYield: m.get('dividendYieldRatio') ?? null,
      dividendAt: m.get('dividendAt') ?? null,
      high52: num(m.get('highPriceOf52Weeks')),
      low52: num(m.get('lowPriceOf52Weeks')),
      after,
      history,
    });
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '6자리 종목 코드 또는 알파벳 ticker 필요' }, { status: 400 });
  }

  try {
    const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) return NextResponse.json({ error: `Naver ${r.status}` }, { status: 502 });
    const j = (await r.json()) as NaverKrInfo;

    // totalInfos 를 key 기반 map 으로 변환
    const map = new Map<string, string>();
    for (const t of j.totalInfos ?? []) map.set(t.code, t.value);

    // dealTrendInfos → 차트용 데이터 (최근 → 오래된 순서로 옴, reverse 해서 시간순)
    const history = (j.dealTrendInfos ?? []).map((d) => ({
      date: `${d.bizdate.slice(0, 4)}-${d.bizdate.slice(4, 6)}-${d.bizdate.slice(6, 8)}`,
      close: Number(d.closePrice.replace(/,/g, '')),
      open: 0,
      high: 0,
      low: 0,
      change: Number(d.compareToPreviousClosePrice.replace(/[+,]/g, '')),
      direction: d.compareToPreviousPrice?.name ?? null,
      volume: Number(d.accumulatedTradingVolume.replace(/,/g, '')),
    })).reverse();

    return NextResponse.json({
      ok: true,
      code: j.itemCode,
      reutersCode: j.itemCode,
      name: j.stockName,
      nameEng: null,
      foreign: false,
      currency: 'KRW',
      exchange: j.stockEndType === 'etf' ? 'ETF' : null,
      exchangeKor: null,
      nation: '대한민국',
      industry: map.get('industryName') ?? null,
      marketStatus: null,
      localTradedAt: null,
      price: history.length > 0 ? history[history.length - 1].close : null,
      lastClose: Number((map.get('lastClosePrice') ?? '0').replace(/,/g, '')) || null,
      open: Number((map.get('openPrice') ?? '0').replace(/,/g, '')) || null,
      high: Number((map.get('highPrice') ?? '0').replace(/,/g, '')) || null,
      low: Number((map.get('lowPrice') ?? '0').replace(/,/g, '')) || null,
      volume: map.get('accumulatedTradingVolume') ?? null,
      tradingValue: map.get('accumulatedTradingValue') ?? null,
      marketCap: map.get('marketValue') ?? null,
      foreignRate: map.get('foreignRate') ?? null,
      per: map.get('per') ?? null,
      eps: map.get('eps') ?? null,
      pbr: map.get('pbr') ?? null,
      bps: map.get('bps') ?? null,
      dividend: map.get('dividend') ?? null,
      dividendYield: map.get('dividendYieldRatio') ?? null,
      dividendAt: null,
      high52: Number((map.get('highPriceOf52Weeks') ?? '0').replace(/,/g, '')) || null,
      low52: Number((map.get('lowPriceOf52Weeks') ?? '0').replace(/,/g, '')) || null,
      after: null,
      history,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'fetch 실패' }, { status: 502 });
  }
}
