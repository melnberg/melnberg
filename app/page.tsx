import { unstable_cache } from 'next/cache';
import Layout from '@/components/Layout';
import AptMap, { type AptPin, type FeedItem } from '@/components/AptMap';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata = {
  title: '멜른버그 — 아파트 지도',
  description: '단지별 토론·평가가 모이는 곳. 지도에서 단지 핀을 눌러 시작합니다.',
};

export const dynamic = 'force-dynamic';

// apt_master 는 거의 안 변함 (어드민이 수동 추가/수정). 5분 캐싱으로 충분.
// unstable_cache 내부에서는 cookies() 못 씀 → anon 클라이언트
const fetchAptPins = unstable_cache(
  async (): Promise<AptPin[]> => {
    const supabase = createPublicClient();
    const all: AptPin[] = [];
    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data, error } = await supabase
        .from('apt_master')
        .select('id, apt_nm, dong, lat, lng, household_count, building_count, kapt_build_year, geocoded_address, occupier_id, occupied_at')
        .not('lat', 'is', null)
        // 빌라/오피스텔 등 비아파트 제거: K-apt 등록(kapt_code) 또는 100세대 이상만
        .or('kapt_code.not.is.null,household_count.gte.100')
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
  },
  ['home-apt-pins'],
  { revalidate: 300, tags: ['apt-master'] },
);

// 피드 — 30초 캐싱. 글(apt_discussions) + 댓글(apt_discussion_comments) 합쳐 시간순.
const fetchFeed = unstable_cache(
  async (): Promise<FeedItem[]> => {
    const supabase = createPublicClient();
    const [{ data: discs }, { data: cmts }] = await Promise.all([
      supabase
        .from('apt_discussions')
        .select('id, apt_master_id, author_id, title, content, created_at, apt_master(apt_nm, dong, lat, lng)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('apt_discussion_comments')
        .select('id, discussion_id, author_id, content, created_at, discussion:apt_discussions!discussion_id(title, apt_master_id, apt_master(apt_nm, dong, lat, lng))')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const allAuthorIds = Array.from(new Set([
      ...((discs ?? []).map((d) => (d as Record<string, unknown>).author_id as string)),
      ...((cmts ?? []).map((c) => (c as Record<string, unknown>).author_id as string)),
    ].filter(Boolean)));

    type ProfRow = { display_name: string | null; link_url: string | null; tier: string | null; tier_expires_at: string | null; is_solo: boolean | null };
    const profileMap = new Map<string, ProfRow>();
    if (allAuthorIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, link_url, tier, tier_expires_at, is_solo')
        .in('id', allAuthorIds);
      for (const p of (profs ?? []) as Array<{ id: string } & ProfRow>) {
        profileMap.set(p.id, p);
      }
    }
    const now = Date.now();
    const isActivePaid = (p: ProfRow | undefined) => !!p && p.tier === 'paid' && (!p.tier_expires_at || new Date(p.tier_expires_at).getTime() > now);

    const discussionItems: FeedItem[] = (discs ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const am = row.apt_master as { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null;
      const prof = profileMap.get(row.author_id as string);
      return {
        kind: 'discussion',
        id: row.id as number,
        apt_master_id: row.apt_master_id as number,
        title: row.title as string,
        content: row.content as string | null,
        created_at: row.created_at as string,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
      };
    });

    const commentItems: FeedItem[] = (cmts ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const disc = row.discussion as { title: string | null; apt_master_id: number | null; apt_master: { apt_nm: string | null; dong: string | null; lat: number | null; lng: number | null } | null } | null;
      const am = disc?.apt_master ?? null;
      const prof = profileMap.get(row.author_id as string);
      return {
        kind: 'comment',
        id: row.id as number,
        apt_master_id: (disc?.apt_master_id ?? 0) as number,
        title: disc?.title ?? '(삭제된 글)',
        content: row.content as string | null,
        created_at: row.created_at as string,
        apt_nm: am?.apt_nm ?? null,
        dong: am?.dong ?? null,
        lat: am?.lat ?? null,
        lng: am?.lng ?? null,
        author_name: prof?.display_name ?? null,
        author_link: prof?.link_url ?? null,
        author_is_paid: isActivePaid(prof),
        author_is_solo: !!prof?.is_solo,
      };
    });

    return [...discussionItems, ...commentItems]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50);
  },
  ['home-feed'],
  { revalidate: 30, tags: ['apt-discussions', 'apt-discussion-comments', 'profiles'] },
);

export default async function HomePage() {
  const [pins, feed] = await Promise.all([fetchAptPins(), fetchFeed()]);

  return (
    <Layout current="home">
      <AptMap pins={pins} feed={feed} />
    </Layout>
  );
}
