// 본동 좌표 fix (대구로 잘못 박힌 케이스) + 흑석자이 추가
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

async function geocode(query) {
  const r = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`,
    { headers: { Authorization: `KakaoAK ${KAKAO}` } });
  const j = await r.json();
  return (j.documents ?? []).filter((d) => {
    const last = (d.category_name ?? '').split('>').map((s) => s.trim()).pop() ?? '';
    return last === '아파트';
  });
}

// 1. 본동 좌표 fix
async function fixCoord(id, query, sggPrefix) {
  const docs = await geocode(query);
  const same = docs.filter((d) => (d.address_name ?? '').startsWith(sggPrefix));
  const pick = same[0] ?? docs[0];
  if (!pick) { console.log(`  id=${id} ✗ 검색 결과 없음`); return; }
  const { error } = await sb.from('apt_master').update({
    lat: Number(pick.y),
    lng: Number(pick.x),
    geocoded_address: pick.address_name,
    geocoded_place_name: pick.place_name,
    geocoded_at: new Date().toISOString(),
  }).eq('id', id);
  console.log(`  id=${id} → ${pick.place_name} (${pick.address_name})`, error ?? 'OK');
}

console.log('=== 본동 좌표 fix ===');
await fixCoord(4634, '서울 동작구 본동 본동삼성래미안아파트', '서울 동작구');
await fixCoord(4075, '서울 동작구 본동 신동아아파트', '서울 동작구');

// 2. 흑석동 단지 추가/업데이트
const HEUKSEOK = [
  { name: '흑석자이', household: 1772, building: 26, year: 2023 },
  { name: '흑석한강센트레빌1차', household: 655, building: 10, year: 2011 },
];
for (const t of HEUKSEOK) {
  console.log(`\n=== ${t.name} ===`);
  const { data: existing } = await sb.from('apt_master').select('id, apt_nm, dong')
    .or(`apt_nm.eq.${t.name},apt_nm.ilike.%${t.name}%`).eq('dong', '흑석동');
  if (existing && existing.length > 0) {
    const r = existing[0];
    const { error } = await sb.from('apt_master').update({
      household_count: t.household, building_count: t.building, kapt_build_year: t.year,
    }).eq('id', r.id);
    console.log(`  UPDATE id=${r.id} (${r.apt_nm}) → ${t.household}세대 / ${t.building}동`, error ?? 'OK');
    continue;
  }
  const docs = await geocode(t.name + '아파트');
  const same = docs.filter((d) => (d.address_name ?? '').startsWith('서울 동작구'));
  const place = same[0] ?? docs[0];
  if (!place) { console.log('  ✗ Kakao 결과 없음'); continue; }
  const { data, error } = await sb.from('apt_master').insert({
    apt_nm: t.name, dong: '흑석동', lawd_cd: '11590',
    lat: Number(place.y), lng: Number(place.x),
    household_count: t.household, building_count: t.building, kapt_build_year: t.year,
    geocoded_address: place.address_name,
    geocoded_place_name: place.place_name,
    geocoded_category: place.category_name,
    geocoded_at: new Date().toISOString(),
    geocode_failed: false,
  }).select('id, apt_nm');
  console.log(`  INSERT`, data?.[0] ?? error);
  await new Promise((r) => setTimeout(r, 200));
}
