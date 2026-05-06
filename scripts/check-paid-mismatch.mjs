// 자동등업 누락 점검 — naver_id 입력했는데 tier=free 인 프로필을 cafe_paid_members 와 대조.
//
// 누락 케이스:
//   A) cafe_paid_members 에 naver_id 있는데 닉네임 mismatch → 등업 실패 (수동 보정 필요)
//   B) cafe_paid_members 에 naver_id 자체가 없음 → 카페 동기화 누락 또는 그냥 미등록
//   C) 매칭 가능한데 etv 시점에 트리거 안 탔음 → 즉시 등업 가능 (063 룰)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAll(table, select, filter) {
  const out = [];
  let from = 0; const PAGE = 1000;
  while (true) {
    let q = sb.from(table).select(select).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(`[${table}]`, error.message); break; }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const profiles = await fetchAll('profiles', 'id, display_name, naver_id, tier, tier_expires_at', (q) =>
  q.not('naver_id', 'is', null).neq('naver_id', '')
);
const cafeMembers = await fetchAll('cafe_paid_members', 'naver_id, cafe_nickname, registered_at');

console.log(`profiles with naver_id: ${profiles.length}`);
console.log(`cafe_paid_members: ${cafeMembers.length}`);

// 카페 명부 인덱스 (naver_id lowercase → row)
const cafeByNid = new Map();
for (const c of cafeMembers) {
  cafeByNid.set((c.naver_id ?? '').trim().toLowerCase(), c);
}

const free = profiles.filter((p) => p.tier !== 'paid');
console.log(`\nfree tier with naver_id: ${free.length}`);

const A_nick_mismatch = [];
const B_not_in_cafe = [];
const C_should_be_paid = [];
const D_just_no_naver_id = []; // 빈 ID

for (const p of free) {
  const nid = (p.naver_id ?? '').trim().toLowerCase();
  if (!nid) { D_just_no_naver_id.push(p); continue; }
  const c = cafeByNid.get(nid);
  if (!c) { B_not_in_cafe.push(p); continue; }
  const profNick = (p.display_name ?? '').trim();
  const cafeNick = (c.cafe_nickname ?? '').trim();
  if (profNick === cafeNick) {
    C_should_be_paid.push({ ...p, cafe_nickname: cafeNick });
  } else {
    A_nick_mismatch.push({ ...p, cafe_nickname: cafeNick });
  }
}

console.log(`\n=== A) 카페 명부에 있고 naver_id 일치, 닉네임만 mismatch (${A_nick_mismatch.length}) ===`);
for (const r of A_nick_mismatch.slice(0, 30)) {
  console.log(`  ${r.naver_id}  사이트:"${r.display_name}" vs 카페:"${r.cafe_nickname}"`);
}
if (A_nick_mismatch.length > 30) console.log(`  ... +${A_nick_mismatch.length - 30}건`);

console.log(`\n=== B) 카페 명부에 naver_id 자체가 없음 (${B_not_in_cafe.length}) ===`);
for (const r of B_not_in_cafe.slice(0, 30)) {
  console.log(`  ${r.naver_id}  ("${r.display_name}")`);
}
if (B_not_in_cafe.length > 30) console.log(`  ... +${B_not_in_cafe.length - 30}건`);

console.log(`\n=== C) 매칭 가능 — 트리거가 안 탔음, 즉시 등업해야 함 (${C_should_be_paid.length}) ===`);
for (const r of C_should_be_paid.slice(0, 50)) {
  console.log(`  ${r.naver_id}  ("${r.display_name}")  → tier=paid 즉시 가능`);
}

console.log(`\n=== 요약 ===`);
console.log(`A 닉네임 mismatch: ${A_nick_mismatch.length}건  (사용자 또는 카페 닉네임 정정 필요)`);
console.log(`B 카페 명부 미등록: ${B_not_in_cafe.length}건  (실제 비유료자 또는 카페 동기화 누락)`);
console.log(`C 즉시 등업 가능: ${C_should_be_paid.length}건  (--apply 추가 시 일괄 처리)`);

if (process.argv.includes('--apply')) {
  console.log(`\n[APPLY] C ${C_should_be_paid.length}명 tier=paid 로 일괄 업데이트...`);
  let n = 0;
  for (const r of C_should_be_paid) {
    const { error } = await sb.from('profiles')
      .update({ tier: 'paid', tier_expires_at: '2099-12-31T00:00:00+00:00' })
      .eq('id', r.id);
    if (error) { console.error(`  ✗ ${r.naver_id}: ${error.message}`); continue; }
    n++;
  }
  console.log(`  완료: ${n}명 등업`);
}
