import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';

// 홈 지도 핀.
// detail=1 → 중소형 (100~999세대)
// fresh=1  → in-process 캐시 우회 (지금은 캐시 자체가 없으므로 의미상 동일, 하위 호환용)
//
// 정책 (2026-05-06 재발 방지 v6):
//   1. unstable_cache 완전 제거 — 빈 결과/부분 결과가 캐시에 박히는 사고 반복.
//      Vercel HTTP edge cache (Cache-Control s-maxage=60) 만 의존.
//   2. fetchBig/Small 은 모든 실패를 throw → endpoint 가 503 반환 (no-store).
//      → 클라가 200 + {pins:[]} 받고 화면 비우는 상황 원천 차단.
//   3. 0개 반환도 throw — RLS 사고/일시 장애가 영구화 안 되도록.

const PIN_SELECT = 'id, apt_nm, dong, lawd_cd, lat, lng, household_count, building_count, kapt_build_year, geocoded_address, occupier_id, occupied_at, listing_price';

async function fetchBig(): Promise<unknown[]> {
  const supabase = createPublicClient();
  const all: unknown[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data, error } = await supabase
      .from('apt_master_with_listing')
      .select(PIN_SELECT)
      .not('lat', 'is', null)
      .or('household_count.gte.1000,occupier_id.not.is.null,listing_price.not.is.null')
      .range(offset, offset + 999);
    if (error) throw new Error(`fetchBig offset=${offset}: ${error.message}`);
    if (!data) throw new Error(`fetchBig offset=${offset}: null data`);
    if (data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  if (all.length === 0) throw new Error('fetchBig: 0 rows — Supabase/RLS/view 이슈 의심');
  return all;
}

async function fetchSmall(): Promise<unknown[]> {
  const supabase = createPublicClient();
  const all: unknown[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data, error } = await supabase
      .from('apt_master_with_listing')
      .select(PIN_SELECT)
      .not('lat', 'is', null)
      .gte('household_count', 100)
      .lt('household_count', 1000)
      .is('occupier_id', null)
      .range(offset, offset + 999);
    if (error) throw new Error(`fetchSmall offset=${offset}: ${error.message}`);
    if (!data) throw new Error(`fetchSmall offset=${offset}: null data`);
    if (data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  if (all.length === 0) throw new Error('fetchSmall: 0 rows');
  return all;
}

// 평당가는 best-effort — 실패해도 핀은 그대로 표시. 절대 throw 안 함.
type PyeongRow = { apt_nm: string; lawd_cd: string; dong_norm: string; pyeong_price: number };
async function fetchPyeongDict(): Promise<Record<string, number>> {
  const supabase = createPublicClient();
  const dict: Record<string, number> = {};
  try {
    for (let offset = 0; offset < 200000; offset += 1000) {
      const { data, error } = await supabase
        .from('apt_pyeong_avg')
        .select('apt_nm, lawd_cd, dong_norm, pyeong_price')
        .range(offset, offset + 999);
      if (error || !data || data.length === 0) break;
      for (const r of data as PyeongRow[]) {
        dict[`${r.apt_nm}|${r.lawd_cd}|${r.dong_norm}`] = r.pyeong_price;
      }
      if (data.length < 1000) break;
    }
  } catch { /* MV 미생성 환경 */ }
  return dict;
}

type PinRow = { apt_nm: string; lawd_cd: string; dong: string | null };
function attachPyeong(rows: unknown[], dict: Record<string, number>): unknown[] {
  const keys = Object.keys(dict ?? {});
  if (keys.length === 0) return rows;
  return (rows as Array<PinRow & Record<string, unknown>>).map((p) => ({
    ...p,
    pyeong_price: dict[`${p.apt_nm}|${p.lawd_cd}|${p.dong ?? ''}`] ?? null,
  }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const detail = url.searchParams.get('detail') === '1';

  try {
    const pinsPromise = detail ? fetchSmall() : fetchBig();
    const pyeongPromise = fetchPyeongDict(); // best-effort
    const [pinsRaw, pyeongDict] = await Promise.all([pinsPromise, pyeongPromise]);
    const pins = attachPyeong(pinsRaw, pyeongDict);
    return NextResponse.json(
      { pins },
      // 5분 edge cache + 30분 stale-while-revalidate (DB 부하 감소 위해 60s→300s 확대, 2026-05-06).
      // 핀 데이터는 점거/매물 변경 외엔 거의 안 바뀜. mutation 시엔 별도 revalidate 안 해도 5분 후 자동 갱신.
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=1800' } },
    );
  } catch (err) {
    // 200 + 빈 배열로 절대 안 내려감 → 클라가 화면 비우는 사고 차단.
    // 클라는 r.ok 체크해서 기존 localStorage 캐시 유지.
    console.error('[home-pins] fetch failed:', err);
    return NextResponse.json(
      { pins: [], error: err instanceof Error ? err.message : String(err) },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
