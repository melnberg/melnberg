// 강변아파트 (id=3553) 좌표 + 세대수 수동 보정
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Kakao 키워드 검색 — '강변아파트 가양동' 으로 정확히
const url = 'https://dapi.kakao.com/v2/local/search/keyword.json?query=' + encodeURIComponent('가양 강변아파트');
const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
const j = await r.json();
const docs = (j.documents ?? []).filter((d) => d.address_name?.includes('가양동'));
if (docs.length === 0) { console.error('카카오 매칭 실패'); process.exit(1); }
const pick = docs.find((d) => d.place_name?.includes('관리사무소')) ?? docs[0];
const lat = Number(pick.y);
const lng = Number(pick.x);
console.log(`매칭: ${pick.place_name} | ${pick.address_name} | (${lat}, ${lng})`);

const { error } = await sb.from('apt_master').update({
  lat, lng,
  geocoded_address: pick.address_name,
  geocoded_place_name: pick.place_name,
  geocoded_category: pick.category_name,
  geocoded_at: new Date().toISOString(),
  geocode_failed: false,
  geocode_failure_reason: null,
  household_count: 1556,
  building_count: 12,
  kapt_build_year: 1992,
}).eq('id', 3553);

if (error) { console.error(error.message); process.exit(1); }
console.log('✓ id=3553 강변아파트 좌표·세대수 보정 완료');
