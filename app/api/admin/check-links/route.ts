import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel — 최대 1분 (Pro)

type Target = { id: string; url: string };

async function checkUrl(url: string): Promise<'ok' | 'dead'> {
  // 일부 사이트(네이버 블로그·인스타 등)는 HEAD 거부 → GET 으로 fallback.
  // 6초 timeout. 200~399 → ok, 그 외 → dead. 네트워크 에러도 dead.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; melnberg-link-check/1.0)' },
      });
    } catch {
      // HEAD 실패 — GET 재시도
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; melnberg-link-check/1.0)' },
      });
    }
    clearTimeout(t);
    if (res.status >= 200 && res.status < 400) return 'ok';
    // 405 Method Not Allowed 만 GET 재시도 (이미 위에서 fallback 시도했지만 일부 환경에서 throw 안 함)
    if (res.status === 405) {
      const r2 = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; melnberg-link-check/1.0)' } });
      if (r2.status >= 200 && r2.status < 400) return 'ok';
    }
    return 'dead';
  } catch {
    return 'dead';
  }
}

export async function POST(req: NextRequest) {
  // 관리자만
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const { data: prof } = await sb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!prof?.is_admin) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const targets = (body?.targets ?? []) as Target[];
  if (!Array.isArray(targets) || targets.length === 0) {
    return NextResponse.json({ error: 'targets 비어있음' }, { status: 400 });
  }

  // 동시 8개씩 처리 (네트워크 부하 + 1분 timeout 고려)
  const CONCURRENCY = 8;
  const results: Array<{ id: string; status: 'ok' | 'dead' }> = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(async (t) => {
      const status = await checkUrl(t.url);
      return { id: t.id, status };
    }));
    results.push(...settled);
  }

  return NextResponse.json({ results });
}
