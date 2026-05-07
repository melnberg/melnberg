// 주식 일별 종가 동기화 — 매일 KST 16시 (= UTC 07시) Naver 금융에서 fetch.
// Naver endpoint: https://api.finance.naver.com/siseJson.naver?symbol={code}&requestType=1&...
// 응답이 JSON-like 텍스트라 안전하게 파싱.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Stock = { code: string };

// Naver 일별 시세 API — 최근 5거래일 데이터.
// 형식: 헤더줄 + N개 데이터줄, 각 줄은 [날짜, 시가, 고가, 저가, 종가, 거래량, 외인소진율]
async function fetchLatestFromNaver(code: string): Promise<{ trade_date: string; close: number; volume: number } | null> {
  try {
    const today = new Date();
    const end = ymd(today);
    const start = ymd(addDays(today, -10)); // 휴일 대비 여유
    const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`;
    const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const text = await r.text();
    // 응답: [['날짜','시가',...], ['20250506', 71000, ...], ...]
    // 안전하게 줄단위 정규식으로 마지막 데이터 찾음
    const matches = text.matchAll(/\['?(\d{8})'?,\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(\d+)/g);
    let last: { date: string; close: number; volume: number } | null = null;
    for (const m of matches) {
      last = { date: m[1], close: Number(m[5]), volume: Number(m[6]) };
    }
    if (!last) return null;
    const trade_date = `${last.date.slice(0, 4)}-${last.date.slice(4, 6)}-${last.date.slice(6, 8)}`;
    return { trade_date, close: last.close, volume: last.volume };
  } catch { return null; }
}

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: stocks } = await sb.from('stocks').select('code').eq('active', true);
  const list = (stocks ?? []) as Stock[];
  if (list.length === 0) return NextResponse.json({ ok: true, updated: 0, skipped: 0 });

  let updated = 0, skipped = 0, failed = 0;

  // Naver 부담 줄이려고 순차 + 50ms 간격
  for (const s of list) {
    const latest = await fetchLatestFromNaver(s.code);
    if (!latest) { failed++; continue; }

    // 전일 종가 가져와서 등락률 계산
    const { data: prev } = await sb.from('stock_prices')
      .select('close, trade_date')
      .eq('code', s.code)
      .lt('trade_date', latest.trade_date)
      .order('trade_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevClose = (prev as { close?: number } | null)?.close ?? null;
    const change_amount = prevClose != null ? latest.close - Number(prevClose) : null;
    const change_pct = prevClose != null && Number(prevClose) > 0
      ? Number(((latest.close - Number(prevClose)) / Number(prevClose) * 100).toFixed(2))
      : null;

    const { error } = await sb.from('stock_prices').upsert({
      code: s.code,
      trade_date: latest.trade_date,
      close: latest.close,
      change_amount,
      change_pct,
      volume: latest.volume,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'code,trade_date' });

    if (error) failed++;
    else updated++;

    await new Promise((r) => setTimeout(r, 50));
  }

  return NextResponse.json({ ok: true, total: list.length, updated, skipped, failed });
}
