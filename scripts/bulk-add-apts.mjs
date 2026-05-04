// 단지 일괄 추가/업데이트 — TARGETS 만 교체해서 재사용
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KAKAO = process.env.KAKAO_REST_API_KEY;

const TARGETS = [
  { name: '롯데캐슬이스트폴', dong: '자양동', lawd: '11215', household: 1063, building: 6, year: 2025 },
  { name: '강변역센트럴아이파크', dong: '구의동', lawd: '11215', household: 215, building: 4, year: 2026 },
  { name: '성수아이파크', dong: '성수동2가', lawd: '11200', household: 656, building: 11, year: 2003 },
  { name: '성동자이리버뷰', dong: '용답동', lawd: '11200', household: 1670, building: 14, year: 2027 },
];

const SGG = {
  '11215': '서울 광진구', '11200': '서울 성동구',
};

async function geocode(query) {
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`,
    { headers: { Authorization: `KakaoAK ${KAKAO}` } });
  const j = await r.json();
  return (j.documents ?? []).filter((d) => {
    const last = (d.category_name ?? '').split('>').map((s) => s.trim()).pop() ?? '';
    return last === '아파트';
  });
}

for (const t of TARGETS) {
  console.log(`\n=== ${t.name} (${t.dong}) ===`);
  const { data: existing } = await sb
    .from('apt_master')
    .select('id, apt_nm, dong')
    .or(`apt_nm.eq.${t.name},apt_nm.ilike.%${t.name}%`)
    .eq('dong', t.dong);

  if (existing && existing.length > 0) {
    const row = existing[0];
    const { error } = await sb.from('apt_master').update({
      household_count: t.household,
      building_count: t.building,
      kapt_build_year: t.year,
    }).eq('id', row.id);
    console.log(`  UPDATE id=${row.id} (${row.apt_nm}) → ${t.household}세대 / ${t.building}동`, error ?? 'OK');
    continue;
  }

  // 신규: 시군구 prefix 매칭 후보 우선
  const sgg = SGG[t.lawd];
  const docs = await geocode(t.name + '아파트');
  const same = docs.filter((d) => (d.address_name ?? '').startsWith(sgg));
  const place = same[0] ?? docs[0];
  if (!place) { console.log(`  ✗ Kakao 결과 없음 — 수동 처리 필요`); continue; }
  console.log(`  Kakao: ${place.place_name} | ${place.address_name}`);
  const { data, error } = await sb.from('apt_master').insert({
    apt_nm: t.name,
    dong: t.dong,
    lawd_cd: t.lawd,
    lat: Number(place.y),
    lng: Number(place.x),
    household_count: t.household,
    building_count: t.building,
    kapt_build_year: t.year,
    geocoded_address: place.address_name,
    geocoded_place_name: place.place_name,
    geocoded_category: place.category_name,
    geocoded_at: new Date().toISOString(),
    geocode_failed: false,
  }).select('id, apt_nm');
  console.log(`  INSERT`, data?.[0] ?? error);
  await new Promise((r) => setTimeout(r, 200));
}
