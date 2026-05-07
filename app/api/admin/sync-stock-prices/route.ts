// 어드민 수동 트리거 — 주식 시세 동기화. CRON_SECRET 필요 없음 (admin 인증으로 충분).
// 동작은 /api/cron/sync-stock-prices 와 동일.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Stock = { code: string };

async function fetchLatestFromNaver(code: string): Promise<{ trade_date: string; close: number; volume: number } | null> {
  try {
    const today = new Date();
    const end = ymd(today);
    const start = ymd(addDays(today, -10));
    const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`;
    const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const text = await r.text();
    const matches = text.matchAll(/\[\s*["'](\d{8})["']\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*(\d+)/g);
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

export async function POST(_req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!(prof as { is_admin?: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: '어드민만 가능' }, { status: 403 });
  }

  const { data: stocks } = await admin.from('stocks').select('code').eq('active', true);
  const list = (stocks ?? []) as Stock[];
  if (list.length === 0) return NextResponse.json({ ok: true, total: 0, updated: 0, failed: 0 });

  let updated = 0, failed = 0;
  for (const s of list) {
    const latest = await fetchLatestFromNaver(s.code);
    if (!latest) { failed++; continue; }

    const { data: prev } = await admin.from('stock_prices')
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

    const { error } = await admin.from('stock_prices').upsert({
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

  return NextResponse.json({ ok: true, total: list.length, updated, failed });
}
