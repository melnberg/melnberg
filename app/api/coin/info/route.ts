// 코인 통합 정보 — Upbit ticker + 일봉 candles.
// 응답 형태는 StockInfo 와 호환되도록 — 카드 컴포넌트 공통화 가능.
// GET /api/coin/info?code=KRW-BTC

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type UpbitTicker = {
  market: string;
  trade_price: number;
  prev_closing_price: number;
  opening_price: number;
  high_price: number;
  low_price: number;
  change: 'RISE' | 'FALL' | 'EVEN';
  change_price: number;
  change_rate: number;
  signed_change_price: number;
  signed_change_rate: number;
  acc_trade_price_24h: number;
  acc_trade_volume_24h: number;
  highest_52_week_price: number;
  lowest_52_week_price: number;
  trade_timestamp: number;
};

type UpbitCandle = {
  market: string;
  candle_date_time_kst: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_volume: number;
};

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: '코인 코드 필요 (예: KRW-BTC)' }, { status: 400 });
  if (!/^KRW-[A-Z0-9]{2,10}$/.test(code)) {
    return NextResponse.json({ error: '코인 코드 형식 오류 (KRW-BTC 등)' }, { status: 400 });
  }
  try {
    const [tickerRes, candleRes, marketsRes] = await Promise.all([
      fetch(`https://api.upbit.com/v1/ticker?markets=${code}`, { cache: 'no-store' }),
      fetch(`https://api.upbit.com/v1/candles/days?market=${code}&count=60`, { cache: 'no-store' }),
      fetch('https://api.upbit.com/v1/market/all?isDetails=false', { cache: 'no-store' }),
    ]);
    if (!tickerRes.ok) return NextResponse.json({ error: `Upbit ticker ${tickerRes.status}` }, { status: 502 });
    const tickerArr = (await tickerRes.json()) as UpbitTicker[];
    const t = tickerArr[0];
    if (!t) return NextResponse.json({ error: '시세 없음' }, { status: 404 });
    const candles = candleRes.ok ? ((await candleRes.json()) as UpbitCandle[]) : [];
    const markets = marketsRes.ok
      ? ((await marketsRes.json()) as Array<{ market: string; korean_name: string; english_name: string }>)
      : [];
    const meta = markets.find((m) => m.market === code);

    // 차트 — 최근→오래된 순서로 옴, reverse
    const history = candles
      .map((c) => ({
        date: c.candle_date_time_kst.slice(0, 10),
        open: c.opening_price,
        high: c.high_price,
        low: c.low_price,
        close: c.trade_price,
        change: 0,
        direction: null as string | null,
        volume: c.candle_acc_trade_volume,
      }))
      .reverse();
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1].close;
      const cur = history[i].close;
      history[i].change = cur - prev;
      history[i].direction = cur > prev ? 'RISING' : cur < prev ? 'FALLING' : 'EVEN';
    }

    // 거래대금 — 24h KRW. 한국식 단위(억/조) 변환.
    const fmtKrwHangeul = (n: number): string => {
      if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조`;
      if (n >= 1e8) return `${Math.round(n / 1e8).toLocaleString()}억`;
      if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
      return Math.round(n).toLocaleString();
    };

    return NextResponse.json({
      ok: true,
      code: t.market,
      reutersCode: t.market,
      name: meta?.korean_name ?? t.market,
      nameEng: meta?.english_name ?? null,
      foreign: false,
      currency: 'KRW',
      exchange: 'Upbit',
      exchangeKor: 'Upbit (KRW)',
      nation: '대한민국',
      industry: '암호화폐',
      marketStatus: 'TRADE',
      localTradedAt: new Date(t.trade_timestamp).toISOString(),
      price: t.trade_price,
      lastClose: t.prev_closing_price,
      open: t.opening_price,
      high: t.high_price,
      low: t.low_price,
      volume: Math.round(t.acc_trade_volume_24h).toLocaleString(),
      tradingValue: fmtKrwHangeul(t.acc_trade_price_24h) + ' KRW',
      marketCap: null,
      foreignRate: null,
      per: null,
      eps: null,
      pbr: null,
      bps: null,
      dividend: null,
      dividendYield: null,
      dividendAt: null,
      high52: t.highest_52_week_price,
      low52: t.lowest_52_week_price,
      after: null,
      history,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upbit fetch 실패' }, { status: 502 });
  }
}
