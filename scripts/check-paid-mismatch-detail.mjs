// 자동등업 누락 — 5명 시간 흐름 분석
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TARGETS = new Set(['lawliet7777', 'sjs9123', 'ryuga97', 'kjwmika', 'zapzal']);

async function fetchAll(table, select) {
  const out = [];
  let from = 0; const PAGE = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(from, from + PAGE - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

const profs = (await fetchAll('profiles', 'id, display_name, naver_id, tier, tier_expires_at, created_at'))
  .filter((p) => TARGETS.has((p.naver_id ?? '').trim().toLowerCase()));
const cafe = (await fetchAll('cafe_paid_members', 'naver_id, cafe_nickname, registered_at'))
  .filter((c) => TARGETS.has((c.naver_id ?? '').trim().toLowerCase()));

const cafeByNid = new Map();
for (const c of cafe) cafeByNid.set((c.naver_id ?? '').trim().toLowerCase(), c);

console.log(`profile rows: ${profs.length}, cafe rows: ${cafe.length}\n`);

console.log('=== 5명 타임라인 ===\n');
for (const p of profs.sort((a, b) => a.naver_id.localeCompare(b.naver_id))) {
  const c = cafeByNid.get((p.naver_id ?? '').trim().toLowerCase());
  console.log(`◆ ${p.naver_id}  사이트닉:"${p.display_name}"  카페닉:"${c?.cafe_nickname}"`);
  console.log(`   profile.created_at:  ${p.created_at}`);
  console.log(`   cafe.registered_at:  ${c?.registered_at ?? '—'}`);
  console.log(`   tier 현재: ${p.tier}`);
  if (c) {
    const profCreated = new Date(p.created_at).getTime();
    const cafeRegistered = new Date(c.registered_at).getTime();
    const flag = [];
    if (cafeRegistered > profCreated + 24 * 3600 * 1000) flag.push('카페 등록이 가입보다 1일+ 늦음 → 카페 측 트리거 (auto_paid_on_cafe_member_add) 동작 누락 의심');
    if (cafeRegistered < profCreated - 24 * 3600 * 1000) flag.push('카페 등록이 가입보다 1일+ 빠름 → handle_new_user 동작 누락 의심');
    if (Math.abs(cafeRegistered - profCreated) < 24 * 3600 * 1000) flag.push('가입 ↔ 카페등록 1일 이내 — race 가능');
    console.log(`   진단: ${flag.join(' / ') || '시간 충돌 없음'}`);
  }
  console.log('');
}
