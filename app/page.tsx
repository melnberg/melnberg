import Layout from '@/components/Layout';
import AptMap, { type AptPin } from '@/components/AptMap';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: '멜른버그 — 아파트 지도',
  description: '단지별 토론·평가가 모이는 곳. 지도에서 단지 핀을 눌러 시작합니다.',
};

export const dynamic = 'force-dynamic';

async function fetchAptPins(): Promise<AptPin[]> {
  const supabase = await createClient();
  const all: AptPin[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data, error } = await supabase
      .from('apt_master')
      .select('id, apt_nm, dong, lawd_cd, lat, lng, household_count, building_count, kapt_build_year, kapt_code, geocoded_address, occupier_id')
      .not('lat', 'is', null)
      .range(offset, offset + 999);
    if (error) {
      console.warn('apt_master fetch error at offset', offset, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as AptPin[]));
    if (data.length < 1000) break;
  }
  return all;
}

export default async function HomePage() {
  const pins = await fetchAptPins();

  return (
    <Layout current="home">
      <AptMap pins={pins} />
    </Layout>
  );
}
