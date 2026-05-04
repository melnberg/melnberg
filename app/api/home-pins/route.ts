import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 홈 지도 핀.
// detail=1 → 중소형 (100~999세대)
// fresh=1  → unstable_cache 우회. 점거/강제집행 직후 강제 갱신용

const PIN_SELECT = 'id, apt_nm, dong, lat, lng, household_count, building_count, kapt_build_year, geocoded_address, occupier_id, occupied_at';

async function fetchBig(): Promise<unknown[]> {
  const supabase = createPublicClient();
  const all: unknown[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data, error } = await supabase
      .from('apt_master')
      .select(PIN_SELECT)
      .not('lat', 'is', null)
      .or('household_count.gte.1000,occupier_id.not.is.null')
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
      .from('apt_master')
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

const fetchBigCached = unstable_cache(fetchBig, ['home-pins-big'], { revalidate: 300, tags: ['apt-master'] });
const fetchSmallCached = unstable_cache(fetchSmall, ['home-pins-small'], { revalidate: 300, tags: ['apt-master'] });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const detail = url.searchParams.get('detail') === '1';
  const fresh = url.searchParams.get('fresh') === '1';
  let pins: unknown[];
  if (detail) {
    pins = fresh ? await fetchSmall() : await fetchSmallCached();
  } else {
    pins = fresh ? await fetchBig() : await fetchBigCached();
  }
  return NextResponse.json(
    { pins },
    {
      headers: fresh
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    },
  );
}
