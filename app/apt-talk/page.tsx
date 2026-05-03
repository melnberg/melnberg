import Layout from '@/components/Layout';
import AptMap, { type AptPin } from '@/components/AptMap';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: '아파트 토론방 — 멜른버그',
  description: '단지별 토론·평가가 모이는 곳. 지도에서 단지 핀을 눌러 시작합니다.',
};

export const dynamic = 'force-dynamic';

// apt_master에서 좌표 있는 단지 전체 fetch (페이지네이션 — PostgREST max-rows=1000 우회)
// 모든 단지 표시. 300 이하·미수집은 클라이언트에서 작은 파란 점으로 표시.
async function fetchAptPins(): Promise<AptPin[]> {
  const supabase = await createClient();
  const all: AptPin[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data, error } = await supabase
      .from('apt_master')
      .select('id, apt_nm, dong, lawd_cd, lat, lng, household_count')
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

export default async function AptTalkPage() {
  const pins = await fetchAptPins();

  return (
    <Layout current="apt-talk">
      <AptMap pins={pins} />
    </Layout>
  );
}
