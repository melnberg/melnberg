// NULL household_count 일괄 보강 — K-apt 공공데이터 API + fuzzy 매칭
//
// 흐름:
//   1) household_count IS NULL 인 row 추출 (시군구·동 기준 그룹)
//   2) 각 (시군구·동) 별로 ODcloud getAptInfo 호출 (cond[ADRES::LIKE]={시군구명+동})
//   3) 응답의 COMPLEX_NM1/2/3 중 하나와 우리 apt_nm fuzzy 매칭
//      - 정규화: 공백·아파트·괄호·단지·차·N단지 등 제거 + lowercase
//   4) 매칭되면 UNIT_CNT/DONG_CNT/USEAPR_DT 업데이트
//
// 실행:
//   node scripts/backfill-household.mjs            → DRY (서울 강남구만)
//   node scripts/backfill-household.mjs --apply    → 적용
//   node scripts/backfill-household.mjs --apply --full  → 전국 NULL 전부

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const KEY = process.env.DATA_GO_KR_API_KEY;
if (!KEY) { console.error('DATA_GO_KR_API_KEY 누락'); process.exit(1); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const FULL = args.has('--full');
const RATE_MS = 200;

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

// 정규화 — fuzzy 매칭용
function norm(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')              // 괄호 제거
    .replace(/아파트$/, '')
    .replace(/[\s·,.\-_]/g, '')              // 공백·구두점 제거
    .replace(/[0-9]+(차|단지)/g, '')          // "1차" "2단지" 제거
    .replace(/(아파트|단지|타운|맨션|빌|빌딩|타워)$/g, '')
    .trim();
}

function fuzzyMatch(ourName, kaptNames) {
  const a = norm(ourName);
  if (!a || a.length < 2) return false;
  for (const n of kaptNames) {
    const b = norm(n);
    if (!b) continue;
    if (a === b) return true;
    if (a.length >= 4 && b.includes(a)) return true;
    if (b.length >= 4 && a.includes(b)) return true;
  }
  return false;
}

// ODcloud getAptInfo 호출 — 시군구명+동 기반
async function fetchAptInfo(sggName, dong) {
  const url = new URL('https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo');
  url.searchParams.set('serviceKey', KEY);
  url.searchParams.set('page', '1');
  url.searchParams.set('perPage', '500');
  url.searchParams.set('returnType', 'JSON');
  url.searchParams.set('cond[ADRES::LIKE]', `${sggName} ${dong}`);
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.data ?? []);
}

// 1. NULL row 그룹화
const { data: nullRows } = await sb
  .from('apt_master')
  .select('id, apt_nm, dong, lawd_cd')
  .is('household_count', null)
  .not('dong', 'is', null);
console.log(`NULL household_count rows: ${nullRows?.length ?? 0}`);

// (lawd_cd, dong) → rows[]
const groups = new Map();
for (const r of nullRows ?? []) {
  const key = `${r.lawd_cd}|${r.dong}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

// FULL 아니면 강남구만 시범
const targetGroups = FULL
  ? Array.from(groups.entries())
  : Array.from(groups.entries()).filter(([k]) => k.startsWith('11680|'));
console.log(`처리 그룹 수: ${targetGroups.length}\n`);

let matched = 0, skipped = 0, fetchFailed = 0;
for (const [key, rows] of targetGroups) {
  const [lawdCd, dong] = key.split('|');
  const sggName = SGG_NAME[lawdCd];
  if (!sggName) { skipped += rows.length; continue; }

  const aptInfo = await fetchAptInfo(sggName, dong);
  if (aptInfo.length === 0) {
    fetchFailed += rows.length;
    continue;
  }

  for (const r of rows) {
    const candidate = aptInfo.find((info) => {
      const names = [info.COMPLEX_NM1, info.COMPLEX_NM2, info.COMPLEX_NM3].filter(Boolean);
      return fuzzyMatch(r.apt_nm, names);
    });
    if (!candidate) continue;
    const update = {
      household_count: candidate.UNIT_CNT ? Number(candidate.UNIT_CNT) : null,
      building_count: candidate.DONG_CNT ? Number(candidate.DONG_CNT) : null,
      kapt_code: candidate.COMPLEX_PK ?? null,
      kapt_build_year: candidate.USEAPR_DT
        ? Number(String(candidate.USEAPR_DT).slice(0, 4))
        : null,
      kapt_fetched_at: new Date().toISOString(),
    };
    matched++;
    console.log(`  [${matched}] id=${r.id} ${r.apt_nm} → ${update.household_count}세대 / ${update.building_count}동 / ${update.kapt_build_year}년`);
    if (APPLY) {
      const { error } = await sb.from('apt_master').update(update).eq('id', r.id);
      if (error) console.log(`     ✗ ${error.message}`);
    }
  }
  await new Promise((res) => setTimeout(res, RATE_MS));
}

console.log(`\n=== 결과 ===`);
console.log(`매칭 성공: ${matched}건${APPLY ? ' (DB 반영됨)' : ' (DRY RUN)'}`);
console.log(`skipped: ${skipped}, fetchFailed: ${fetchFailed}`);
