// 기존 restaurant_pins 의 dong 을 카카오 좌표→행정동 API 로 채움
// (address 가 도로명주소만 있어서 SQL regex 로 추출 안 되는 경우)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!KAKAO_KEY) { console.error('KAKAO_REST_API_KEY 누락'); process.exit(1); }

const { data: pins, error } = await sb
  .from('restaurant_pins')
  .select('id, name, address, lat, lng')
  .is('dong', null)
  .is('deleted_at', null);
if (error) { console.error(error); process.exit(1); }

console.log(`dong 비어있는 핀 ${pins?.length ?? 0}개`);
let updated = 0;
for (const p of (pins ?? [])) {
  const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${p.lng}&y=${p.lat}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
    if (!r.ok) { console.log(`  ✗ #${p.id} ${p.name}: HTTP ${r.status}`); continue; }
    const j = await r.json();
    // documents 에서 region_type 'H' (행정동) 우선, 없으면 'B' (법정동)
    const docs = (j.documents ?? []);
    const h = docs.find((d) => d.region_type === 'H') ?? docs.find((d) => d.region_type === 'B');
    const dong = h?.region_3depth_name ?? null;
    if (!dong) { console.log(`  ⚠ #${p.id} ${p.name}: 행정동 추출 실패`); continue; }
    const { error: upErr } = await sb.from('restaurant_pins').update({ dong }).eq('id', p.id);
    if (upErr) { console.log(`  ✗ #${p.id} ${p.name}: ${upErr.message}`); continue; }
    console.log(`  ✓ #${p.id} ${p.name} → ${dong}`);
    updated++;
    await new Promise((r) => setTimeout(r, 100)); // rate limit
  } catch (e) {
    console.log(`  ✗ #${p.id} ${p.name}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\n완료: ${updated}개 업데이트`);
