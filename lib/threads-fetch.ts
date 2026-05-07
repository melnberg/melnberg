// 스레드 author 별도 fetch — PostgREST 의 FK 모호 (auth.users + profiles 둘 다)
// 회피용. select 를 두 단계로 분리: threads 행 fetch → author_id IN profiles fetch → 병합.

import type { Thread } from '@/components/ThreadList';

// Supabase 의 PostgrestFilterBuilder 는 실제 Promise 가 아닌 thenable.
// 구조 타입은 SupabaseClient 와 호환 강제 시 deep instantiation 유발 →
// 호출 측 수용성 위해 minimal any-ish 로 받음.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  tier: string | null;
  tier_expires_at: string | null;
  is_solo: boolean | null;
  link_url: string | null;
};

type ThreadCore = Omit<Thread, 'author' | 'liked'>;

export async function attachAuthorsToThreads(
  supabase: SupabaseLike,
  rows: ThreadCore[],
): Promise<Array<ThreadCore & { author: Thread['author'] }>> {
  if (rows.length === 0) return [];
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const { data: profs } = (await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, tier, tier_expires_at, is_solo, link_url')
    .in('id', authorIds)) as { data: unknown[] | null };
  const map = new Map<string, ProfileRow>();
  for (const p of ((profs ?? []) as ProfileRow[])) map.set(p.id, p);
  return rows.map((r) => ({
    ...r,
    author: map.get(r.author_id) ?? null,
  }));
}
