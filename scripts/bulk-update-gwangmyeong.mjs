// 광명시 신축 6개 일괄 업데이트/추가
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
  { name: '광명센트럴아이파크', dong: '광명동', household: 1957, building: 11, year: 2025 },
  { name: '광명자이힐스테이트SKVIEW', dong: '광명동', household: 2878, building: 18, year: 2027 },
  { name: '트리우스광명', dong: '광명동', household: 3344, building: 26, year: 2024 },
  { name: '광명자이더샵포레나', dong: '광명동', household: 3585, building: 28, year: 2025 },
  { name: '철산자이브리에르', dong: '철산동', household: 1490, building: 14, year: 2026 },
  { name: '철산자이더헤리티지', dong: '철산동', household: 3804, building: 23, year: 2025 },
];

async function geocode(query) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query + '아파트')}&size=10`;
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO}` } });
  const j = await r.json();
  // 카테고리 마지막 segment가 정확히 '아파트'인 것만 (게이트/상가/관리 제외)
  const docs = (j.documents ?? []).filter((d) => {
    const last = (d.category_name ?? '').split('>').map((s) => s.trim()).pop() ?? '';
    return last === '아파트';
  });
  return docs[0] ?? null;
}

for (const t of TARGETS) {
  console.log(`\n=== ${t.name} (${t.dong}) ===`);
  // 기존 row 체크 (정확 일치 + 부분 일치)
  const { data: existing } = await sb
    .from('apt_master')
    .select('id, apt_nm, dong, household_count')
    .or(`apt_nm.eq.${t.name},apt_nm.ilike.%${t.name}%`)
    .eq('dong', t.dong);

  if (existing && existing.length > 0) {
    const row = existing[0];
    const { error } = await sb.from('apt_master').update({
      household_count: t.household,
      building_count: t.building,
      kapt_build_year: t.year,
    }).eq('id', row.id);
    console.log(`  UPDATE id=${row.id} (${row.apt_nm}) → ${t.household}세대 / ${t.building}동 / ${t.year}년`, error ?? 'OK');
    continue;
  }

  // 신규 INSERT — Kakao geocode
  const place = await geocode(t.name);
  if (!place) { console.log(`  ✗ Kakao 검색 실패. 수동 처리 필요`); continue; }
  console.log(`  Kakao: ${place.place_name} | ${place.address_name}`);
  const { data, error } = await sb.from('apt_master').insert({
    apt_nm: t.name,
    dong: t.dong,
    lawd_cd: '41210',
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
