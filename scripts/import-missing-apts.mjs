// K-apt 전국 단지 dump → 우리 apt_master에 없는 단지 자동 INSERT
//
// 흐름:
//   1) 시군구별 ODcloud getAptInfo 페이지네이션으로 전체 단지 dump
//   2) 각 단지의 COMPLEX_PK(=kapt_code)가 우리 DB에 없으면 신규 후보
//   3) 신규 후보의 도로명/지번 주소 → Kakao address API로 좌표 획득
//   4) INSERT (lat/lng/세대수/동수/준공년도 등)
//
// 실행:
//   node scripts/import-missing-apts.mjs                → DRY (강남구만)
//   node scripts/import-missing-apts.mjs --apply        → 강남구 적용
//   node scripts/import-missing-apts.mjs --apply --full → 서울+인천+경기 전부
//   node scripts/import-missing-apts.mjs --apply --sgg=11440  → 특정 시군구만

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.DATA_GO_KR_API_KEY;
const KAKAO = process.env.KAKAO_REST_API_KEY;
if (!KEY) { console.error('DATA_GO_KR_API_KEY 누락'); process.exit(1); }
if (!KAKAO) { console.error('KAKAO_REST_API_KEY 누락'); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const FULL = args.has('--full');
const SGG_ARG = process.argv.find((a) => a.startsWith('--sgg='))?.slice('--sgg='.length);

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
  '28110': '인천 중구', '28140': '인천 동구', '28177': '인천 미추홀구',
  '28185': '인천 연수구', '28200': '인천 남동구', '28237': '인천 부평구',
  '28245': '인천 계양구', '28260': '인천 서구',
  '41111': '수원시 장안구', '41113': '수원시 권선구', '41115': '수원시 팔달구',
  '41117': '수원시 영통구', '41131': '성남시 수정구', '41133': '성남시 중원구',
  '41135': '성남시 분당구', '41150': '의정부시', '41171': '안양시 만안구',
  '41173': '안양시 동안구', '41192': '부천시', '41210': '광명시',
  '41220': '평택시', '41281': '고양시 덕양구', '41285': '고양시 일산동구',
  '41287': '고양시 일산서구', '41290': '과천시', '41310': '구리시',
  '41360': '남양주시', '41390': '시흥시', '41410': '군포시',
  '41430': '의왕시', '41450': '하남시', '41463': '용인시 처인구',
  '41465': '용인시 기흥구', '41467': '용인시 수지구', '41480': '파주시',
  '41500': '이천시', '41550': '안성시', '41570': '김포시',
  '41590': '화성시', '41610': '광주시', '41630': '양주시',
  '41650': '포천시', '41670': '여주시',
};

let targets;
if (SGG_ARG) targets = [[SGG_ARG, SGG_NAME[SGG_ARG]]].filter(([, v]) => v);
else if (FULL) targets = Object.entries(SGG_NAME);
else targets = [['11680', '서울 강남구']];

console.log(`처리 대상 시군구 ${targets.length}개${APPLY ? ' (APPLY)' : ' (DRY)'}\n`);

// ODcloud 페이지네이션
async function fetchAptList(sggName) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const url = new URL('https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo');
    url.searchParams.set('serviceKey', KEY);
    url.searchParams.set('page', String(page));
    url.searchParams.set('perPage', '500');
    url.searchParams.set('returnType', 'JSON');
    url.searchParams.set('cond[ADRES::LIKE]', sggName);
    const r = await fetch(url);
    if (!r.ok) { console.warn(`  fetch err page ${page}: ${r.status}`); break; }
    const j = await r.json();
    const data = j.data ?? [];
    if (data.length === 0) break;
    all.push(...data);
    if (data.length < 500) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  return all;
}

// Kakao address geocoding
async function geocodeAddr(address) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO}` } });
  if (!r.ok) return null;
  const j = await r.json();
  const first = (j.documents ?? [])[0];
  if (!first) return null;
  return { lat: Number(first.y), lng: Number(first.x), display: first.address_name };
}

// 주소에서 동/리/가 추출
function extractDong(addr) {
  if (!addr) return null;
  const m = addr.match(/([가-힣]+(?:동|리|가))(?:\s|$)/);
  return m ? m[1] : null;
}

async function existingKaptCodes(codes) {
  const set = new Set();
  for (let i = 0; i < codes.length; i += 200) {
    const slice = codes.slice(i, i + 200);
    const { data } = await sb.from('apt_master').select('kapt_code').in('kapt_code', slice);
    for (const r of data ?? []) if (r.kapt_code) set.add(r.kapt_code);
  }
  return set;
}

async function existingByName(sggLawd, dong, name) {
  const { data } = await sb.from('apt_master').select('id, apt_nm')
    .eq('lawd_cd', sggLawd).eq('dong', dong).eq('apt_nm', name);
  return (data ?? [])[0] ?? null;
}

let totalInserted = 0, totalSkipped = 0, totalGeocodeFail = 0;

for (const [lawdCd, sggName] of targets) {
  console.log(`\n[${lawdCd}] ${sggName} ─────────`);
  const apts = await fetchAptList(sggName);
  console.log(`  K-apt 응답: ${apts.length}건`);
  if (apts.length === 0) continue;

  // 기존 kapt_code 셋
  const allCodes = apts.map((a) => a.COMPLEX_PK).filter(Boolean);
  const have = await existingKaptCodes(allCodes);

  let insertedHere = 0, skippedHere = 0, failedHere = 0;
  for (const a of apts) {
    const code = a.COMPLEX_PK;
    const name = a.COMPLEX_NM1;
    const addr = a.ROAD_ADRES || a.ADRES;
    if (!name || !addr) { skippedHere++; continue; }

    if (code && have.has(code)) { skippedHere++; continue; }

    // kapt_code 없거나 우리 DB에 없는 코드 → name+dong으로 추가 체크
    const dong = extractDong(a.ADRES) ?? extractDong(addr);
    if (!dong) { skippedHere++; continue; }
    const dup = await existingByName(lawdCd, dong, name);
    if (dup) {
      // 기존 row가 있으면 kapt_code 채워주기 (정확 매칭)
      if (code && APPLY) {
        await sb.from('apt_master').update({
          kapt_code: code,
          household_count: a.UNIT_CNT ? Number(a.UNIT_CNT) : null,
          building_count: a.DONG_CNT ? Number(a.DONG_CNT) : null,
          kapt_build_year: a.USEAPR_DT ? Number(String(a.USEAPR_DT).slice(0, 4)) : null,
          kapt_fetched_at: new Date().toISOString(),
        }).eq('id', dup.id);
      }
      skippedHere++;
      continue;
    }

    // Geocode
    const geo = await geocodeAddr(addr);
    if (!geo) { failedHere++; continue; }

    const row = {
      apt_nm: name,
      dong,
      lawd_cd: lawdCd,
      lat: geo.lat,
      lng: geo.lng,
      household_count: a.UNIT_CNT ? Number(a.UNIT_CNT) : null,
      building_count: a.DONG_CNT ? Number(a.DONG_CNT) : null,
      kapt_code: code ?? null,
      kapt_build_year: a.USEAPR_DT ? Number(String(a.USEAPR_DT).slice(0, 4)) : null,
      kapt_fetched_at: new Date().toISOString(),
      geocoded_address: geo.display,
      geocoded_at: new Date().toISOString(),
      geocode_failed: false,
    };

    if (APPLY) {
      const { error } = await sb.from('apt_master').insert(row);
      if (error) { failedHere++; console.warn(`     INSERT 실패 ${name}: ${error.message}`); continue; }
    }
    insertedHere++;
    if (insertedHere <= 5 || insertedHere % 20 === 0) {
      console.log(`     [${insertedHere}] ${name} (${dong}) — ${row.household_count}세대`);
    }
    await new Promise((res) => setTimeout(res, 80)); // Kakao rate
  }
  console.log(`  → 신규 ${insertedHere} / 스킵(이미존재) ${skippedHere} / 실패 ${failedHere}`);
  totalInserted += insertedHere;
  totalSkipped += skippedHere;
  totalGeocodeFail += failedHere;
}

console.log(`\n=== 전체 결과 ===`);
console.log(`신규 추가: ${totalInserted}건${APPLY ? ' (DB 반영됨)' : ' (DRY)'}`);
console.log(`스킵: ${totalSkipped}, 지오코딩 실패: ${totalGeocodeFail}`);
