// 신축 단지 1건 추가 — Kakao 키워드 검색으로 좌표·주소 자동 매핑
//
// 사용법:
//   node scripts/add-new-apt.mjs "잠실래미안아이파크" 2678
//   node scripts/add-new-apt.mjs "단지명" 세대수 [참고좌표lat,lng]
//
// 옵션 좌표는 Kakao 검색 결과가 여러 개일 때 가까운 것 우선

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

const aptNm = process.argv[2];
const householdCount = Number(process.argv[3]);
const refCoord = process.argv[4]?.split(',').map(Number);

if (!aptNm || !Number.isFinite(householdCount)) {
  console.error('사용법: node scripts/add-new-apt.mjs "단지명" 세대수 [참고lat,lng]');
  process.exit(1);
}

// 1) Kakao 키워드 검색
const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(aptNm + '아파트')}&size=15`
  + (refCoord ? `&y=${refCoord[0]}&x=${refCoord[1]}&radius=2000&sort=distance` : '');
const resp = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
const j = await resp.json();
const docs = j.documents ?? [];
console.log(`Kakao 검색 결과 ${docs.length}건:`);
for (const d of docs) {
  console.log(`  [${d.id}] ${d.place_name} | ${d.address_name} | ${d.category_name}`);
}

// 아파트 카테고리만 필터
const aptDocs = docs.filter((d) => d.category_name?.includes('아파트'));
if (aptDocs.length === 0) {
  console.error('아파트 카테고리 매칭 결과 없음. 검색어 또는 좌표 힌트 수정 필요.');
  process.exit(1);
}
const pick = aptDocs[0];
console.log(`\n선택: ${pick.place_name} (${pick.address_name})`);
const lat = Number(pick.y);
const lng = Number(pick.x);

// 2) lawd_cd 추론 — address_name 의 행정구 코드 매핑이 필요하지만 간이로 시군구명 → lawd_cd
const SGG_CD = {
  '서울 종로구': '11110', '서울 중구': '11140', '서울 용산구': '11170',
  '서울 성동구': '11200', '서울 광진구': '11215', '서울 동대문구': '11230',
  '서울 중랑구': '11260', '서울 성북구': '11290', '서울 강북구': '11305',
  '서울 도봉구': '11320', '서울 노원구': '11350', '서울 은평구': '11380',
  '서울 서대문구': '11410', '서울 마포구': '11440', '서울 양천구': '11470',
  '서울 강서구': '11500', '서울 구로구': '11530', '서울 금천구': '11545',
  '서울 영등포구': '11560', '서울 동작구': '11590', '서울 관악구': '11620',
  '서울 서초구': '11650', '서울 강남구': '11680', '서울 송파구': '11710',
  '서울 강동구': '11740',
};
let lawdCd = null, dong = null;
const addrParts = (pick.address_name ?? '').split(' ');
const sggKey = `${addrParts[0]} ${addrParts[1]}`;
if (SGG_CD[sggKey]) lawdCd = SGG_CD[sggKey];
dong = addrParts[2] ?? null;
console.log(`lawd_cd=${lawdCd}, dong=${dong}`);
if (!lawdCd || !dong) {
  console.error('lawd_cd 또는 dong 추출 실패. 수동 INSERT 필요.');
  process.exit(1);
}

// 3) 중복 체크
const { data: existing } = await sb.from('apt_master').select('id, apt_nm, dong').eq('apt_nm', aptNm).eq('dong', dong);
if (existing && existing.length > 0) {
  console.log('이미 존재:', existing);
  process.exit(0);
}

// 4) INSERT
const { data, error } = await sb.from('apt_master').insert({
  apt_nm: aptNm,
  dong,
  lawd_cd: lawdCd,
  lat,
  lng,
  household_count: householdCount,
  geocoded_address: pick.address_name,
  geocoded_place_name: pick.place_name,
  geocoded_category: pick.category_name,
  geocoded_at: new Date().toISOString(),
  geocode_failed: false,
}).select();

console.log('\n결과:', { data, error });
