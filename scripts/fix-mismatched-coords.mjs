// 좌표·법정동 불일치 단지 재지오코딩
// 케이스: lawd_cd가 서울 마포구(11440)인데 lat이 인천 좌표(< 37.5)로 잘못 박힌 등
// 처리: "서울 {시군구명} {dong} {apt_nm}" 키워드로 카카오 재검색 → 같은 시군구 내 결과만 채택

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

// lawd_cd → 시군구 prefix (Kakao address_name 매칭용)
const SGG_NAME = {
  '11110': '서울 종로구', '11140': '서울 중구', '11170': '서울 용산구',
  '11200': '서울 성동구', '11215': '서울 광진구', '11230': '서울 동대문구',
  '11260': '서울 중랑구', '11290': '서울 성북구', '11305': '서울 강북구',
  '11320': '서울 도봉구', '11350': '서울 노원구', '11380': '서울 은평구',
  '11410': '서울 서대문구', '11440': '서울 마포구', '11470': '서울 양천구',
  '11500': '서울 강서구', '11530': '서울 구로구', '11545': '서울 금천구',
  '11560': '서울 영등포구', '11590': '서울 동작구', '11620': '서울 관악구',
  '11650': '서울 서초구', '11680': '서울 강남구', '11710': '서울 송파구',
  '11740': '서울 강동구',
  // 경기·인천 일부
  '28177': '인천 미추홀구', '41210': '경기 광명시',
};

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply'); // 미지정 시 dry-run

// 1. 후보군 추출 — 마포구 도화동 우선. 확장 가능.
const { data: candidates } = await sb
  .from('apt_master')
  .select('id, apt_nm, dong, lawd_cd, lat, lng, geocoded_address')
  .eq('lawd_cd', '11440')
  .eq('dong', '도화동')
  .lt('lat', 37.5)
  .not('lat', 'is', null);

console.log(`후보 ${candidates?.length ?? 0}건${APPLY ? ' (APPLY 모드)' : ' (DRY RUN — --apply 추가 시 반영)'}\n`);

let fixed = 0, failed = 0, skipped = 0;
for (const r of candidates ?? []) {
  const sggName = SGG_NAME[r.lawd_cd];
  const query = `${sggName} ${r.dong} ${r.apt_nm}아파트`;
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`;
  const resp = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO}` } });
  const j = await resp.json();
  const docs = (j.documents ?? []).filter((d) => {
    const last = (d.category_name ?? '').split('>').map((s) => s.trim()).pop() ?? '';
    return last === '아파트';
  });
  // 같은 시군구 prefix 매칭
  const same = docs.filter((d) => (d.address_name ?? '').startsWith(sggName));
  const pick = same[0] ?? docs[0];
  if (!pick) {
    console.log(`  [SKIP] id=${r.id} ${r.apt_nm} — 검색 결과 없음`);
    skipped++;
    continue;
  }
  if (!same.length) {
    console.log(`  [WARN] id=${r.id} ${r.apt_nm} — 같은 시군구 결과 없음, 첫 결과 사용: ${pick.address_name}`);
  }
  const newLat = Number(pick.y), newLng = Number(pick.x);
  const oldStr = `${r.lat?.toFixed(4)}, ${r.lng?.toFixed(4)}`;
  const newStr = `${newLat.toFixed(4)}, ${newLng.toFixed(4)}`;
  console.log(`  [FIX ] id=${r.id} ${r.apt_nm}`);
  console.log(`         ${oldStr} → ${newStr} (${pick.address_name})`);
  if (APPLY) {
    const { error } = await sb.from('apt_master').update({
      lat: newLat,
      lng: newLng,
      geocoded_address: pick.address_name,
      geocoded_place_name: pick.place_name,
      geocoded_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (error) { console.log(`         ✗ UPDATE 실패: ${error.message}`); failed++; }
    else fixed++;
  }
  await new Promise((res) => setTimeout(res, 150)); // rate-limit
}

console.log(`\n결과: ${APPLY ? `fixed ${fixed} / failed ${failed}` : 'DRY RUN'} / skipped ${skipped}`);
