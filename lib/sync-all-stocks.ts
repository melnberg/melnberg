// 전체 KOSPI + KOSDAQ 종목 동기화 — Naver 모바일 + KRX 둘 다 시도.
// admin route + cron route 가 공유.

import { createClient } from '@supabase/supabase-js';

type Row = { code: string; name: string; market: 'KOSPI' | 'KOSDAQ' };

// Naver finance: 시총순 페이지 HTML 파싱
async function fetchNaverMarketPage(market: 'KOSPI' | 'KOSDAQ', page: number): Promise<Row[]> {
  const sosok = market === 'KOSPI' ? 0 : 1;
  const url = `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${sosok}&page=${page}`;
  try {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    if (!r.ok) return [];
    const buf = await r.arrayBuffer();
    const html = new TextDecoder('euc-kr').decode(buf);
    // <a href="/item/main.naver?code=005930" ...>삼성전자</a>
    const re = /href="\/item\/main\.naver\?code=(\d{6})"[^>]*>([^<]+)<\/a>/g;
    const items: Row[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const code = m[1];
      const name = m[2].trim();
      if (seen.has(code)) continue;
      if (!name) continue;
      seen.add(code);
      items.push({ code, name, market });
    }
    return items;
  } catch { return []; }
}

async function fetchNaverAll(market: 'KOSPI' | 'KOSDAQ'): Promise<Row[]> {
  const all: Row[] = [];
  const seen = new Set<string>();
  for (let p = 1; p <= 50; p++) {
    const rows = await fetchNaverMarketPage(market, p);
    let added = 0;
    for (const r of rows) {
      if (seen.has(r.code)) continue;
      seen.add(r.code);
      all.push(r);
      added++;
    }
    // 새로 추가된 종목 없으면 끝 도달
    if (added === 0) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return all;
}

// KRX 공식 (백업)
async function fetchKrxAll(market: 'KOSPI' | 'KOSDAQ'): Promise<Row[]> {
  const mktId = market === 'KOSPI' ? 'STK' : 'KSQ';
  const today = new Date(Date.now() - 24 * 3600 * 1000);
  const tradeDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  try {
    const otpRes = await fetch('http://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'http://data.krx.co.kr/contents/MDC/STAT/standard/MDCSTAT01901.cmd',
      },
      body: new URLSearchParams({
        bld: 'dbms/MDC/STAT/standard/MDCSTAT01901',
        mktId, trdDd: tradeDate, share: '1', money: '1', csvxls_isNo: 'false',
      }).toString(),
    });
    if (!otpRes.ok) return [];
    const otp = (await otpRes.text()).trim();
    if (!otp) return [];

    const csvRes = await fetch('http://data.krx.co.kr/comm/fileDn/download_csv/download.cmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'http://data.krx.co.kr/contents/MDC/STAT/standard/MDCSTAT01901.cmd',
      },
      body: new URLSearchParams({ code: otp }).toString(),
    });
    if (!csvRes.ok) return [];
    const buf = await csvRes.arrayBuffer();
    if (buf.byteLength === 0) return [];
    const csv = new TextDecoder('euc-kr').decode(buf);
    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const items: Row[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].match(/(?:^|,)("(?:[^"]+)"|[^,]*)/g);
      if (!cells || cells.length < 2) continue;
      const code = cells[0].replace(/^,?"?|"?$/g, '').trim();
      const name = cells[1].replace(/^,?"?|"?$/g, '').trim();
      if (!/^\d{6}$/.test(code) || !name) continue;
      items.push({ code, name, market });
    }
    return items;
  } catch { return []; }
}

export async function syncAllStocks(): Promise<{ ok: boolean; total: number; kospi: number; kosdaq: number; source: string; error?: string }> {
  // 1차: Naver finance HTML
  let kospi = await fetchNaverAll('KOSPI');
  let kosdaq = await fetchNaverAll('KOSDAQ');
  let source = 'naver';
  // Naver 실패 시 KRX
  if (kospi.length === 0 && kosdaq.length === 0) {
    kospi = await fetchKrxAll('KOSPI');
    kosdaq = await fetchKrxAll('KOSDAQ');
    source = 'krx';
  }
  const all = [...kospi, ...kosdaq];
  if (all.length === 0) return { ok: false, total: 0, kospi: 0, kosdaq: 0, source: 'none', error: 'Naver/KRX 둘 다 실패' };

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const CHUNK = 100;
  for (let i = 0; i < all.length; i += CHUNK) {
    const batch = all.slice(i, i + CHUNK).map((r) => ({ code: r.code, name: r.name, market: r.market, active: true }));
    await sb.from('stocks').upsert(batch, { onConflict: 'code' });
  }

  return { ok: true, total: all.length, kospi: kospi.length, kosdaq: kosdaq.length, source };
}
