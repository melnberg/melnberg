// 트레일링 숫자만 다른 단지 dedup
// 예: 개포우성1 + 개포우성2 → 개포우성 한 단지로 (300m 이내일 때만)
// '개포우성1차' / '개포우성2차'는 차수 표기라 별개 유지

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const l of text.split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes('--apply');

function distM(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// 트레일링 숫자만 제거. "개포우성1" → "개포우성", "개포우성3차" → "개포우성3차"
function strip(s) {
  return s.replace(/(\d+)$/, '').trim();
}

const all = [];
for (let off = 0; off < 20000; off += 1000) {
  const { data } = await sb.from('apt_master').select('id, apt_nm, dong, lawd_cd, lat, lng').not('lat', 'is', null).range(off, off + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
console.log('좌표 보유:', all.length);

const groups = new Map();
for (const r of all) {
  if (!r.dong) continue;
  const key = `${strip(r.apt_nm)}|${r.dong}|${r.lawd_cd}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

let mergeGroups = 0, mergedRows = 0;
const toHide = [];
const migrates = [];

for (const rows of groups.values()) {
  if (rows.length === 1) continue;
  // 단지명이 strip 후 같은 그룹 — 하지만 실제로 다른 단지명일 수도 (e.g., '개포우성' + '개포우성1' + '개포우성2')
  // 그 중 정확히 strip 결과와 같은 row가 있으면 그걸 canonical로
  rows.sort((a, b) => a.id - b.id);
  const canonical = rows[0];
  const groupKey = strip(canonical.apt_nm);
  const closeNeighbors = [];
  for (const r of rows.slice(1)) {
    if (distM(canonical, r) <= 300) {
      closeNeighbors.push(r);
    }
  }
  if (closeNeighbors.length > 0) {
    mergeGroups++;
    for (const r of closeNeighbors) {
      toHide.push(r.id);
      migrates.push({ from: r.id, to: canonical.id });
      mergedRows++;
    }
    if (mergeGroups <= 8) {
      console.log(`  '${groupKey}': ${[canonical, ...closeNeighbors].map(r => `'${r.apt_nm}'(id ${r.id})`).join(' + ')}`);
    }
  }
}

console.log(`\n그룹: ${mergeGroups}, 합칠 row: ${mergedRows}`);

if (!APPLY) {
  console.log('DRY RUN — --apply 추가 시 적용');
  process.exit(0);
}

console.log('\n적용 중...');
let migCount = 0;
for (const m of migrates) {
  const { count } = await sb.from('apt_discussions').select('id', { count: 'exact', head: true }).eq('apt_master_id', m.from).is('deleted_at', null);
  if (count && count > 0) {
    const { error } = await sb.from('apt_discussions').update({ apt_master_id: m.to }).eq('apt_master_id', m.from);
    if (!error) migCount += count;
  }
}
console.log(`discussions migrate: ${migCount}`);

for (let i = 0; i < toHide.length; i += 100) {
  const slice = toHide.slice(i, i + 100);
  const { error } = await sb.from('apt_master').update({ lat: null, lng: null }).in('id', slice);
  if (error) console.error(error.message);
}
console.log(`hide: ${toHide.length}`);
console.log('완료');
