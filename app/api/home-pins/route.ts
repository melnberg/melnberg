import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 홈 지도 핀.
// detail 파라미터:
//   미지정 또는 0  → 기본 (큰 단지·점거 단지만, 화면 첫 진입용)
//   1            → 중소형 (100~999세대) — 줌인 시 추가 로드

const PIN_SELECT = 'id, apt_nm, dong, lat, lng, household_count, building_count, kapt_build_year, geocoded_address, occupier_id, occupied_at';

const fetchBigPins = unstable_cache(
  async () => {
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
  },
  ['home-pins-big'],
  { revalidate: 300, tags: ['apt-master'] },
);

const fetchSmallPins = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const all: unknown[] = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data, error } = await supabase
        .from('apt_master')
        .select(PIN_SELECT)
        .not('lat', 'is', null)
        .gte('household_count', 100)
        .lt('household_count', 1000)
        .is('occupier_id', null) // 점거된 건 이미 big 에 포함
        .range(offset, offset + 999);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
    }
    return all;
  },
  ['home-pins-small'],
  { revalidate: 300, tags: ['apt-master'] },
);

export async function GET(request: Request) {
  const detail = new URL(request.url).searchParams.get('detail') === '1';
  const pins = detail ? await fetchSmallPins() : await fetchBigPins();
  return NextResponse.json(
    { pins },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } },
  );
}
