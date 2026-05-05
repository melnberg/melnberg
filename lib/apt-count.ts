// profiles.apt_count 별도 fetch — SQL 062 미실행이어도 사이트 안 깨지게.
// 컬럼 있으면 Map 채워서 반환, 없으면 빈 Map.

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, vals: string[]) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export async function fetchAptCounts(supabase: SupabaseLike, userIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  try {
    const { data, error } = await supabase.from('profiles').select('id, apt_count').in('id', userIds);
    if (error || !data) return map;
    for (const r of data as Array<{ id: string; apt_count: number | null }>) {
      map.set(r.id, r.apt_count ?? 0);
    }
  } catch { /* 컬럼 없음 — silent */ }
  return map;
}
