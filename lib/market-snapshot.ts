// 주식 게시판 헤더에 노출할 마켓 스냅샷 — 지수 4종 + 인기 종목.
// 서버에서 한 번에 fetch (병렬). force-dynamic 페이지에서만 호출.

export type MarketIndex = {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  history: number[];
  currency: 'KRW' | 'USD' | 'CRYPTO';
};

export type HotStock = {
  code: string;
  name: string;
  postCount: number;
  price: number | null;
  changePct: number | null;
  currency: 'KRW' | 'USD';
  history: number[];
};

const UA = { 'User-Agent': 'Mozilla/5.0' };

async function fetchKrIndex(symbol: 'KOSPI' | 'KOSDAQ', kor: string): Promise<MarketIndex> {
  try {
    const [basicR, chartR] = await Promise.all([
      fetch(`https://m.stock.naver.com/api/index/${symbol}/basic`, { cache: 'no-store', headers: UA }),
      fetch(`https://api.stock.naver.com/chart/domestic/index/${symbol}/day?startDateTime=${dateAgoYmd(60)}000000&endDateTime=${dateAgoYmd(0)}235959`, { cache: 'no-store', headers: UA }),
    ]);
    const basic = basicR.ok ? await basicR.json() : null;
    const chart = chartR.ok ? await chartR.json() : [];
    const close = basic?.closePrice ? Number(String(basic.closePrice).replace(/,/g, '')) : null;
    const change = basic?.compareToPreviousClosePrice ? Number(String(basic.compareToPreviousClosePrice).replace(/[+,]/g, '')) * (basic.compareToPreviousPrice?.name === 'FALLING' ? -1 : 1) : null;
    const pct = basic?.fluctuationsRatio ? Number(basic.fluctuationsRatio) : null;
    const history = Array.isArray(chart) ? chart.slice(-40).map((c: { closePrice: number }) => Number(c.closePrice)) : [];
    return { code: symbol, name: kor, price: close, change, changePct: pct, history, currency: 'KRW' };
  } catch {
    return { code: symbol, name: kor, price: null, change: null, changePct: null, history: [], currency: 'KRW' };
  }
}

async function fetchUsTickerIndex(ticker: string, label: string): Promise<MarketIndex> {
  // SPY (S&P 500 추종) 등을 미국 지수 proxy 로 사용. Naver basic 응답.
  try {
    const [basicR, chartR] = await Promise.all([
      fetch(`https://api.stock.naver.com/stock/${ticker}/basic`, { cache: 'no-store', headers: UA }),
      fetch(`https://api.stock.naver.com/chart/foreign/item/${ticker}/day?startDateTime=${dateAgoYmd(60)}000000&endDateTime=${dateAgoYmd(0)}235959`, { cache: 'no-store', headers: UA }),
    ]);
    const basic = basicR.ok ? await basicR.json() : null;
    const chart = chartR.ok ? await chartR.json() : [];
    const close = basic?.closePrice ? Number(String(basic.closePrice).replace(/,/g, '')) : null;
    const change = basic?.compareToPreviousClosePrice ? Number(String(basic.compareToPreviousClosePrice).replace(/[+,]/g, '')) * (basic.compareToPreviousPrice?.name === 'FALLING' ? -1 : 1) : null;
    const pct = basic?.fluctuationsRatio ? Number(basic.fluctuationsRatio) : null;
    const history = Array.isArray(chart) ? chart.slice(-40).map((c: { closePrice: number }) => Number(c.closePrice)) : [];
    return { code: ticker, name: label, price: close, change, changePct: pct, history, currency: 'USD' };
  } catch {
    return { code: ticker, name: label, price: null, change: null, changePct: null, history: [], currency: 'USD' };
  }
}

async function fetchBtc(): Promise<MarketIndex> {
  try {
    const [tickerR, candleR] = await Promise.all([
      fetch('https://api.upbit.com/v1/ticker?markets=KRW-BTC', { cache: 'no-store' }),
      fetch('https://api.upbit.com/v1/candles/days?market=KRW-BTC&count=40', { cache: 'no-store' }),
    ]);
    const tArr = tickerR.ok ? await tickerR.json() : [];
    const t = tArr[0];
    const candles = candleR.ok ? await candleR.json() : [];
    const history = Array.isArray(candles)
      ? candles.slice().reverse().map((c: { trade_price: number }) => c.trade_price)
      : [];
    return {
      code: 'KRW-BTC',
      name: '비트코인',
      price: t?.trade_price ?? null,
      change: t?.signed_change_price ?? null,
      changePct: t?.signed_change_rate != null ? t.signed_change_rate * 100 : null,
      history,
      currency: 'CRYPTO',
    };
  } catch {
    return { code: 'KRW-BTC', name: '비트코인', price: null, change: null, changePct: null, history: [], currency: 'CRYPTO' };
  }
}

function dateAgoYmd(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

export async function fetchMarketIndices(): Promise<MarketIndex[]> {
  return await Promise.all([
    fetchKrIndex('KOSPI', '코스피'),
    fetchKrIndex('KOSDAQ', '코스닥'),
    fetchUsTickerIndex('SPY', 'S&P 500'),
    fetchBtc(),
  ]);
}

// 인기 종목 — 최근 14일 stocks 카테고리 글에서 stock_code 카운트.
// 상위 N 개 → 시세까지 첨부.
export async function fetchHotStocks(
  posts: Array<{ stock_code: string | null; stock_name: string | null }>,
  limit = 6,
): Promise<HotStock[]> {
  const counter = new Map<string, { count: number; name: string | null }>();
  for (const p of posts) {
    if (!p.stock_code) continue;
    const cur = counter.get(p.stock_code) ?? { count: 0, name: p.stock_name };
    cur.count += 1;
    if (!cur.name && p.stock_name) cur.name = p.stock_name;
    counter.set(p.stock_code, cur);
  }
  const sorted = [...counter.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);

  const results = await Promise.all(
    sorted.map(async ([code, meta]): Promise<HotStock | null> => {
      const isKr6 = /^\d{6}$/.test(code);
      const isUs = /^[A-Z][A-Z0-9.\-]{0,9}$/i.test(code);
      if (!isKr6 && !isUs) return null;
      try {
        // 자체 API 라우터 통해 통합 — 절대 URL 필요 (서버 컴포넌트 fetch).
        // 여기선 직접 Naver 호출이 더 단순 + 빠름.
        if (isKr6) {
          const r = await fetch(`https://m.stock.naver.com/api/stock/${code}/integration`, { cache: 'no-store', headers: UA });
          if (!r.ok) return null;
          const j = await r.json();
          const totalInfos: Array<{ code: string; value: string }> = j.totalInfos ?? [];
          const map = new Map(totalInfos.map((t) => [t.code, t.value]));
          const deal: Array<{ closePrice: string }> = j.dealTrendInfos ?? [];
          const history = deal.slice(0, 30).reverse().map((d) => Number(d.closePrice.replace(/,/g, '')));
          const price = history.length > 0 ? history[history.length - 1] : null;
          const lastClose = Number((map.get('lastClosePrice') ?? '0').replace(/,/g, '')) || null;
          const pct = price != null && lastClose ? ((price - lastClose) / lastClose * 100) : null;
          return {
            code,
            name: meta.name ?? j.stockName ?? code,
            postCount: meta.count,
            price,
            changePct: pct,
            currency: 'KRW',
            history,
          };
        } else {
          // 미국 ticker — suffix 시도
          for (const suf of ['', '.O', '.K', '.N']) {
            const reuters = `${code}${suf}`;
            const [basicR, chartR] = await Promise.all([
              fetch(`https://api.stock.naver.com/stock/${reuters}/basic`, { cache: 'no-store', headers: UA }),
              fetch(`https://api.stock.naver.com/chart/foreign/item/${reuters}/day?startDateTime=${dateAgoYmd(60)}000000&endDateTime=${dateAgoYmd(0)}235959`, { cache: 'no-store', headers: UA }),
            ]);
            if (!basicR.ok) continue;
            const j = await basicR.json();
            if (!j?.reutersCode) continue;
            const chart = chartR.ok ? await chartR.json() : [];
            const history = Array.isArray(chart) ? chart.slice(-30).map((c: { closePrice: number }) => Number(c.closePrice)) : [];
            const price = j.closePrice ? Number(String(j.closePrice).replace(/,/g, '')) : null;
            const pct = j.fluctuationsRatio != null ? Number(j.fluctuationsRatio) * (j.compareToPreviousPrice?.name === 'FALLING' ? -1 : 1) : null;
            return {
              code,
              name: meta.name ?? j.stockName ?? code,
              postCount: meta.count,
              price,
              changePct: pct,
              currency: 'USD',
              history,
            };
          }
          return null;
        }
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is HotStock => r != null);
}
