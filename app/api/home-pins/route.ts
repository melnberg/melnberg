import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 홈 지도 핀.
// detail=1 → 중소형 (100~999세대)
// fresh=1  → unstable_cache 우회. 점거/강제집행 직후 강제 갱신용

// pyeong_price 는 073 마이그가 DB 에 적용된 뒤 별도 fetch 로 합침. 미적용 환경에서도 핀이 보이도록 분리.
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
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
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
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

// 평당가는 별도 fetch — 073 적용된 환경만 데이터 채워짐. 미적용 환경에선 silent skip.
// 주의: unstable_cache 가 Map 을 직렬화 못하므로 plain object 로 반환.
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
  } catch { /* MV 미생성 환경에선 빈 dict 반환 */ }
  return dict;
}

// v3: apt_pyeong_avg MV 적재 전 빈 dict 가 600s 캐시된 상태 무효화
const fetchBigCached = unstable_cache(fetchBig, ['home-pins-big-v4'], { revalidate: 300, tags: ['apt-master'] });
const fetchSmallCached = unstable_cache(fetchSmall, ['home-pins-small-v4'], { revalidate: 300, tags: ['apt-master'] });
const fetchPyeongDictCached = unstable_cache(fetchPyeongDict, ['home-pins-pyeong-v3'], { revalidate: 600, tags: ['apt-pyeong'] });

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
  const fresh = url.searchParams.get('fresh') === '1';

  // 핀 데이터는 필수, 평당가는 best-effort. 평당가 fetch 가 실패해도 핀은 표시.
  const pinsPromise = detail
    ? (fresh ? fetchSmall() : fetchSmallCached())
    : (fresh ? fetchBig() : fetchBigCached());
  const pyeongPromise = fetchPyeongDictCached().catch(() => ({} as Record<string, number>));

  const [pinsRaw, pyeongDict] = await Promise.all([pinsPromise, pyeongPromise]);
  const pins = attachPyeong(pinsRaw, pyeongDict);
  return NextResponse.json(
    { pins },
    {
      headers: fresh
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    },
  );
}
