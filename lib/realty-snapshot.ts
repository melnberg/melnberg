// 부동산 게시판 헤더 스냅샷 — 마켓 통계 + 핫 단지.
import { createPublicClient } from './supabase/public';

export type RealtyStat = {
  label: string;
  value: string;
  sub: string;
  accent: 'gold' | 'rose' | 'azure' | 'emerald';
};

export type HotApt = {
  id: number;
  apt_nm: string;
  dong: string | null;
  discussion_count: number;
  comment_count: number;
};

const isoAgo = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400_000).toISOString();

export async function fetchRealtyStats(): Promise<RealtyStat[]> {
  const sb = createPublicClient();
  const dayAgo = isoAgo(1);

  const [aptC, aucC, lstC, recentTradeC] = await Promise.all([
    sb.from('apt_master').select('id', { count: 'exact', head: true }).then((r) => r.count ?? 0, () => 0),
    sb.from('apt_auctions').select('id', { count: 'exact', head: true }).eq('status', 'active').then((r) => r.count ?? 0, () => 0),
    sb.from('apt_listings').select('apt_id', { count: 'exact', head: true }).then((r) => r.count ?? 0, () => 0),
    sb.from('apt_listings').select('apt_id', { count: 'exact', head: true }).gte('listed_at', dayAgo).then((r) => r.count ?? 0, () => 0),
  ]);

  return [
    { label: '등록 단지', value: aptC.toLocaleString(), sub: 'TOTAL', accent: 'gold' },
    { label: '진행중 경매', value: aucC.toLocaleString(), sub: 'LIVE', accent: 'rose' },
    { label: '등록 매물', value: lstC.toLocaleString(), sub: 'LISTED', accent: 'azure' },
    { label: '24h 신규', value: recentTradeC.toLocaleString(), sub: 'NEW', accent: 'emerald' },
  ];
}

export async function fetchHotApts(limit = 6): Promise<HotApt[]> {
  const sb = createPublicClient();
  const cutoff = isoAgo(14);

  // 최근 14일 토론글 + apt_master 매핑
  const { data: discs } = await sb
    .from('apt_discussions')
    .select('id, apt_master_id, created_at')
    .is('deleted_at', null)
    .gte('created_at', cutoff)
    .limit(500)
    .then((r) => r, () => ({ data: null }));

  const counter = new Map<number, number>();
  for (const d of (discs ?? []) as Array<{ apt_master_id: number }>) {
    counter.set(d.apt_master_id, (counter.get(d.apt_master_id) ?? 0) + 1);
  }
  if (counter.size === 0) {
    // 데이터 없으면 — 그냥 무작위로 단지 6개 노출
    const { data: any6 } = await sb
      .from('apt_master')
      .select('id, apt_nm, dong')
      .not('lat', 'is', null)
      .limit(limit);
    return ((any6 ?? []) as Array<{ id: number; apt_nm: string; dong: string | null }>).map((a) => ({
      ...a,
      discussion_count: 0,
      comment_count: 0,
    }));
  }
  const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  const ids = sorted.map(([id]) => id);
  const { data: aptData } = await sb
    .from('apt_master')
    .select('id, apt_nm, dong')
    .in('id', ids)
    .then((r) => r, () => ({ data: null }));
  const aptMap = new Map<number, { apt_nm: string; dong: string | null }>();
  for (const a of (aptData ?? []) as Array<{ id: number; apt_nm: string; dong: string | null }>) {
    aptMap.set(a.id, { apt_nm: a.apt_nm, dong: a.dong });
  }
  return sorted.map(([id, count]) => ({
    id,
    apt_nm: aptMap.get(id)?.apt_nm ?? '단지',
    dong: aptMap.get(id)?.dong ?? null,
    discussion_count: count,
    comment_count: 0,
  }));
}
