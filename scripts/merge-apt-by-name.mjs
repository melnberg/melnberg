// 단지명 정제 + 시공사별 분리된 단지 합치기
// 예: 관악드림(동아), 관악드림(삼성) → 관악드림 (한 단지로 합침)
// 정책:
//   1) apt_nm에서 (...) 괄호 안 내용 제거 → cleaned_name
//   2) (cleaned_name, lawd_cd) 같은 그룹 → 가장 작은 id 한 개만 canonical
//   3) canonical row의 apt_nm을 cleaned_name으로 업데이트
//   4) 나머지(중복)는 lat/lng = null 처리 (지도에서 숨김)
//   5) 중복 row에 달린 apt_discussions가 있으면 canonical로 migrate

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const l of text.split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY = !process.argv.includes('--apply');

// 1. 좌표 보유 단지 전체 fetch
const all = [];
for (let off = 0; off < 20000; off += 1000) {
  const { data } = await sb.from('apt_master')
    .select('id, apt_nm, dong, lawd_cd, lat, lng')
    .not('lat', 'is', null)
    .range(off, off + 999);
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
console.log(`좌표 보유 단지: ${all.length}`);

// 2. cleaned_name 계산 + 그룹화
function clean(s) { return s.replace(/\([^)]*\)/g, '').trim(); }

const groups = new Map(); // key = `${cleaned}|${dong}|${lawd_cd}` → rows[]
// 같은 동(dong) 안에서만 합침 — 다른 동의 동명 단지는 별개 단지일 가능성 높음
for (const r of all) {
  const cleaned = clean(r.apt_nm);
  if (!cleaned) continue;
  const key = `${cleaned}|${r.dong || ''}|${r.lawd_cd}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...r, cleaned });
}

let mergeGroups = 0, mergedRows = 0, renameRows = 0;
const updates = []; // {action, id, ...}
const discussionMigrates = []; // {fromId, toId}

for (const rows of groups.values()) {
  if (rows.length === 1) {
    // 단독이지만 이름 변경 필요한 경우
    const r = rows[0];
    if (r.apt_nm !== r.cleaned) {
      updates.push({ action: 'rename', id: r.id, newName: r.cleaned });
      renameRows++;
    }
    continue;
  }
  rows.sort((a, b) => a.id - b.id);
  const canonical = rows[0];
  // canonical row 이름이 변경되었으면 업데이트
  if (canonical.apt_nm !== canonical.cleaned) {
    updates.push({ action: 'rename', id: canonical.id, newName: canonical.cleaned });
  }
  // 나머지는 좌표 null 처리 + discussions migrate
  for (const r of rows.slice(1)) {
    updates.push({ action: 'hide', id: r.id });
    discussionMigrates.push({ fromId: r.id, toId: canonical.id });
    mergedRows++;
  }
  mergeGroups++;
}

console.log(`\n그룹별 합치기 대상: ${mergeGroups}개 그룹, ${mergedRows}개 row 숨김 + canonical로 migrate`);
console.log(`이름 정제만 (단독): ${renameRows}개 row`);
console.log(`총 업데이트 작업: ${updates.length}건`);

if (DRY) {
  console.log('\n샘플 합치기 (최대 10):');
  let count = 0;
  for (const rows of groups.values()) {
    if (rows.length === 1) continue;
    if (count >= 10) break;
    const c = rows[0];
    console.log(`  ${c.cleaned} (lawd ${c.lawd_cd}):`);
    for (const r of rows) console.log(`    id=${r.id} ${r.apt_nm} (${r.dong})`);
    count++;
  }
  console.log('\nDRY RUN — 실제 적용하려면 --apply 추가');
  process.exit(0);
}

// 3. 적용
console.log('\n적용 중...');

// rename
const renames = updates.filter((u) => u.action === 'rename');
for (const u of renames) {
  const { error } = await sb.from('apt_master').update({ apt_nm: u.newName }).eq('id', u.id);
  if (error) console.warn(`rename ${u.id} 실패: ${error.message}`);
}
console.log(`rename: ${renames.length}건`);

// discussions migrate (먼저 옮긴 후 hide)
let migCount = 0;
for (const m of discussionMigrates) {
  const { count } = await sb.from('apt_discussions')
    .select('id', { count: 'exact', head: true })
    .eq('apt_master_id', m.fromId)
    .is('deleted_at', null);
  if (count && count > 0) {
    const { error } = await sb.from('apt_discussions').update({ apt_master_id: m.toId }).eq('apt_master_id', m.fromId);
    if (error) console.warn(`migrate ${m.fromId}→${m.toId} 실패: ${error.message}`);
    else migCount += count;
  }
}
console.log(`discussions migrate: ${migCount}건`);

// hide (lat/lng null)
const hides = updates.filter((u) => u.action === 'hide');
for (let i = 0; i < hides.length; i += 100) {
  const slice = hides.slice(i, i + 100).map((u) => u.id);
  const { error } = await sb.from('apt_master').update({ lat: null, lng: null }).in('id', slice);
  if (error) console.warn(`hide batch 실패: ${error.message}`);
}
console.log(`hide: ${hides.length}건`);

console.log('\n완료. 페이지 새로고침 시 합쳐진 단지로 표시됨.');
