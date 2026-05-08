// 코인 게시판 헤더 스냅샷 — Upbit 메이저 + 인기 코인.

export type CoinIndex = {
  code: string;
  name: string;
  english: string;
  price: number | null;
  changePct: number | null;
  history: number[];
};

export type HotCoin = {
  code: string;
  name: string;
  postCount: number;
  price: number | null;
  changePct: number | null;
  history: number[];
};

const MAJORS: Array<{ code: string; name: string; english: string }> = [
  { code: 'KRW-BTC', name: '비트코인', english: 'Bitcoin' },
  { code: 'KRW-ETH', name: '이더리움', english: 'Ethereum' },
  { code: 'KRW-XRP', name: '리플', english: 'XRP' },
  { code: 'KRW-DOGE', name: '도지코인', english: 'Dogecoin' },
];

async function fetchCoinFull(code: string): Promise<{ price: number | null; changePct: number | null; history: number[]; nameKor: string | null; nameEng: string | null }> {
  try {
    const [tR, cR] = await Promise.all([
      fetch(`https://api.upbit.com/v1/ticker?markets=${code}`, { cache: 'no-store' }),
      fetch(`https://api.upbit.com/v1/candles/days?market=${code}&count=40`, { cache: 'no-store' }),
    ]);
    const tArr = tR.ok ? await tR.json() : [];
    const t = tArr[0];
    const candles = cR.ok ? await cR.json() : [];
    const history = Array.isArray(candles)
      ? candles.slice().reverse().map((c: { trade_price: number }) => c.trade_price)
      : [];
    return {
      price: t?.trade_price ?? null,
      changePct: t?.signed_change_rate != null ? t.signed_change_rate * 100 : null,
      history,
      nameKor: null,
      nameEng: null,
    };
  } catch {
    return { price: null, changePct: null, history: [], nameKor: null, nameEng: null };
  }
}

export async function fetchCoinIndices(): Promise<CoinIndex[]> {
  const fulls = await Promise.all(MAJORS.map((m) => fetchCoinFull(m.code)));
  return MAJORS.map((m, i) => ({
    code: m.code,
    name: m.name,
    english: m.english,
    price: fulls[i].price,
    changePct: fulls[i].changePct,
    history: fulls[i].history,
  }));
}

export async function fetchHotCoins(
  posts: Array<{ stock_code: string | null; stock_name: string | null }>,
  limit = 6,
): Promise<HotCoin[]> {
  const counter = new Map<string, { count: number; name: string | null }>();
  for (const p of posts) {
    if (!p.stock_code || !p.stock_code.startsWith('KRW-')) continue;
    const cur = counter.get(p.stock_code) ?? { count: 0, name: p.stock_name };
    cur.count += 1;
    if (!cur.name && p.stock_name) cur.name = p.stock_name;
    counter.set(p.stock_code, cur);
  }
  const sorted = [...counter.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);

  const fulls = await Promise.all(sorted.map(([code]) => fetchCoinFull(code)));
  return sorted.map(([code, meta], i): HotCoin => ({
    code,
    name: meta.name ?? code.replace('KRW-', ''),
    postCount: meta.count,
    price: fulls[i].price,
    changePct: fulls[i].changePct,
    history: fulls[i].history,
  }));
}
