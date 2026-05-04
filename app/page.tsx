import Layout from '@/components/Layout';
import AptMap, { type AptPin, type FeedItem } from '@/components/AptMap';
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

async function fetchFeed(): Promise<FeedItem[]> {
  const supabase = await createClient();
  // apt_master는 FK 있어서 join, profiles는 FK 없어서 별도 fetch
  const { data: discs } = await supabase
    .from('apt_discussions')
    .select('id, apt_master_id, author_id, title, content, created_at, apt_master(apt_nm, dong, lat, lng)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (!discs || discs.length === 0) return [];

  const authorIds = Array.from(new Set(discs.map((d) => (d as Record<string, unknown>).author_id as string).filter(Boolean)));
  const nameMap = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', authorIds);
    for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name) nameMap.set(p.id, p.display_name);
    }
  }

  return (discs as Array<Record<string, unknown>>).map((r) => {
    const am = r.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
    return {
      id: r.id as number,
      apt_master_id: r.apt_master_id as number,
      title: r.title as string,
      content: r.content as string | null,
      created_at: r.created_at as string,
      apt_nm: am?.apt_nm ?? null,
      dong: am?.dong ?? null,
      lat: am?.lat ?? null,
      lng: am?.lng ?? null,
      author_name: nameMap.get(r.author_id as string) ?? null,
    };
  });
}

export default async function HomePage() {
  const [pins, feed] = await Promise.all([fetchAptPins(), fetchFeed()]);

  return (
    <Layout current="home">
      <AptMap pins={pins} feed={feed} />
    </Layout>
  );
}
