// 경매 사용 통계 — 비활성화 vs 완전제거 결정용
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

const { data: aucs30 } = await sb.from('apt_auctions').select('id, status, created_at, completed_at, current_bidder_id, bid_count').gte('created_at', since30d);
const { data: aucs7 } = await sb.from('apt_auctions').select('id, status').gte('created_at', since7d);
const { data: bids30 } = await sb.from('auction_bids').select('id, bidder_id, created_at').gte('created_at', since30d);

console.log(`=== 최근 30일 ===`);
console.log(`등록된 경매: ${aucs30?.length ?? 0}건`);
const completed = (aucs30 ?? []).filter((a) => a.status === 'completed' && a.current_bidder_id).length;
const cancelled = (aucs30 ?? []).filter((a) => a.status === 'cancelled').length;
const active = (aucs30 ?? []).filter((a) => a.status === 'active').length;
console.log(`  - 완료(낙찰): ${completed}`);
console.log(`  - 취소: ${cancelled}`);
console.log(`  - 진행중: ${active}`);
console.log(`총 입찰: ${bids30?.length ?? 0}건`);
console.log(`참여 사용자: ${new Set((bids30 ?? []).map((b) => b.bidder_id)).size}명`);
console.log(`평균 입찰수/경매: ${aucs30?.length ? ((bids30?.length ?? 0) / aucs30.length).toFixed(1) : 0}`);

console.log(`\n=== 최근 7일 ===`);
console.log(`등록된 경매: ${aucs7?.length ?? 0}건`);

console.log(`\n=== 결론 ===`);
const usage = (bids30?.length ?? 0) / 30;
if (usage < 1) console.log('⚠ 거의 안 씀 — A(완전 제거) 권장');
else if (usage < 5) console.log('🟡 가끔 씀 — B(소프트 비활성) 적절. 살려둘 가치 있음');
else console.log('✅ 활발히 사용 — C(부하만 줄이기) 권장');
