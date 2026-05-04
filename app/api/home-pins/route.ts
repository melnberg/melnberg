import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';

// 홈 지도 핀 — 5분 캐싱. 같은 region 내 함수에서 호출되므로 매번 새로 fetch 안 함.
const fetchPins = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const all: unknown[] = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data, error } = await supabase
        .from('apt_master')
        .select('id, apt_nm, dong, lat, lng, household_count, building_count, kapt_build_year, geocoded_address, occupier_id, occupied_at')
        .not('lat', 'is', null)
        .or('kapt_code.not.is.null,household_count.gte.100')
        .range(offset, offset + 999);
      if (error) break;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < 1000) break;
    }
    return all;
  },
  ['api-home-pins'],
  { revalidate: 300, tags: ['apt-master'] },
);

export async function GET() {
  const pins = await fetchPins();
  // 브라우저 + Vercel Edge 1분 캐싱 (같은 IP 잠깐 새로고침 시 즉시)
  return NextResponse.json(
    { pins },
    {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}
