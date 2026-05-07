// 전체 KOSPI + KOSDAQ 종목 일괄 동기화.
// KRX 공식 데이터 사용 — OTP 발급 → CSV 다운로드 → 파싱 → upsert.
// 매일 KST 17시 (장 마감 후) cron 으로 실행.
// 또는 admin 트리거 (/api/admin/sync-all-stocks).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// KRX OTP 발급
async function getKrxOtp(mktId: 'STK' | 'KSQ', tradeDate: string): Promise<string | null> {
  try {
    const r = await fetch('http://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'http://data.krx.co.kr/contents/MDC/STAT/standard/MDCSTAT01901.cmd',
      },
      body: new URLSearchParams({
        bld: 'dbms/MDC/STAT/standard/MDCSTAT01901',
        mktId,
        trdDd: tradeDate,
        share: '1',
        money: '1',
        csvxls_isNo: 'false',
      }).toString(),
    });
    if (!r.ok) return null;
    return (await r.text()).trim();
  } catch { return null; }
}

// KRX CSV 다운로드
async function downloadKrxCsv(otp: string): Promise<string | null> {
  try {
    const r = await fetch('http://data.krx.co.kr/comm/fileDn/download_csv/download.cmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'http://data.krx.co.kr/contents/MDC/STAT/standard/MDCSTAT01901.cmd',
      },
      body: new URLSearchParams({ code: otp }).toString(),
    });
    if (!r.ok) return null;
    // KRX CSV 는 EUC-KR 인코딩
    const buf = await r.arrayBuffer();
    return new TextDecoder('euc-kr').decode(buf);
  } catch { return null; }
}

// CSV 파싱 — 헤더: 종목코드,종목명,...,시장구분
type Row = { code: string; name: string; market: 'KOSPI' | 'KOSDAQ' };
function parseKrxCsv(csv: string, market: 'KOSPI' | 'KOSDAQ'): Row[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const items: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    // CSV 셀 unwrap (큰따옴표·콤마 처리)
    const cells = lines[i].match(/(?:^|,)("(?:[^"]+)"|[^,]*)/g);
    if (!cells || cells.length < 2) continue;
    const code = cells[0].replace(/^,?"?|"?$/g, '').trim();
    const name = cells[1].replace(/^,?"?|"?$/g, '').trim();
    if (!/^\d{6}$/.test(code)) continue;
    if (!name) continue;
    items.push({ code, name, market });
  }
  return items;
}

function ymd(d = new Date()): string {
  // KRX 평일 데이터 — 토일은 전 평일 기준. 단순화 위해 어제 날짜 사용 (장중 호출 시 미생성 방지)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export async function syncAllStocks(): Promise<{ ok: boolean; total: number; kospi: number; kosdaq: number; error?: string }> {
  const tradeDate = ymd(new Date(Date.now() - 24 * 3600 * 1000)); // 어제 (장 마감 보장)

  const all: Row[] = [];
  for (const [mktId, market] of [['STK', 'KOSPI' as const], ['KSQ', 'KOSDAQ' as const]] as const) {
    const otp = await getKrxOtp(mktId, tradeDate);
    if (!otp) continue;
    const csv = await downloadKrxCsv(otp);
    if (!csv) continue;
    const rows = parseKrxCsv(csv, market);
    all.push(...rows);
    await new Promise((r) => setTimeout(r, 500));
  }

  if (all.length === 0) return { ok: false, total: 0, kospi: 0, kosdaq: 0, error: 'KRX 데이터 fetch 실패' };

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 100개씩 배치 upsert
  const CHUNK = 100;
  for (let i = 0; i < all.length; i += CHUNK) {
    const batch = all.slice(i, i + CHUNK).map((r) => ({ code: r.code, name: r.name, market: r.market, active: true }));
    await sb.from('stocks').upsert(batch, { onConflict: 'code' });
  }

  const kospi = all.filter((r) => r.market === 'KOSPI').length;
  const kosdaq = all.filter((r) => r.market === 'KOSDAQ').length;
  return { ok: true, total: all.length, kospi, kosdaq };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await syncAllStocks();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
