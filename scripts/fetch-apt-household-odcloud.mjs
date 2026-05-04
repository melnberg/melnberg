// 한국부동산원 ODcloud "공동주택 단지 식별정보 조회 서비스" 매핑
//
// 흐름:
//   1) apt_master 유니크 (lawd_cd, dong) 그룹화
//   2) 각 그룹 → ODcloud `getAptInfo?cond[ADRES::LIKE]={시군구명+동}` 호출 (한 동의 모든 단지 받음)
//   3) 응답의 COMPLEX_NM1/2/3 중 하나가 우리 apt_nm과 매칭되면 → UNIT_CNT, DONG_CNT, USEAPR_DT, COMPLEX_PK 매핑
//   4) apt_master 업데이트
//
// 사용법:
//   node scripts/fetch-apt-household-odcloud.mjs            → DRY (강남구 1개 동 시험)
//   node scripts/fetch-apt-household-odcloud.mjs --full     → 전체 시군구·동 처리
//
// 환경변수: DATA_GO_KR_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
const FULL = args.has('--full');
const RATE_MS = 200;

// lawd_cd → 시군구 이름 (cron route와 동일)
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

async function fetchOdcloudByDong(sggDong) {
  const all = [];
  let page = 1;
  for (;;) {
    const url = `https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo?serviceKey=${encodeURIComponent(KEY)}&page=${page}&perPage=1000&cond%5BADRES%3A%3ALIKE%5D=${encodeURIComponent(sggDong)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 100)}`);
    }
    const json = await res.json();
    const data = json.data ?? [];
    all.push(...data);
    if (page * 1000 >= (json.matchCount ?? 0) || data.length < 1000) break;
    page++;
    await new Promise((r) => setTimeout(r, RATE_MS));
  }
  return all;
}

function normalize(s) { return (s || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim(); }

function findMatch(odRows, aptNm) {
  const target = normalize(aptNm);
  if (!target || target.length < 2) return null;
  // 1) 정확 일치 (NM1/NM2/NM3 어느 것이든)
  for (const r of odRows) {
    for (const fld of [r.COMPLEX_NM1, r.COMPLEX_NM2, r.COMPLEX_NM3]) {
      if (normalize(fld) === target) return r;
    }
  }
  // 2) 핵심 토큰 포함 (4자 이상)
  if (target.length >= 4) {
    for (const r of odRows) {
      for (const fld of [r.COMPLEX_NM1, r.COMPLEX_NM2, r.COMPLEX_NM3]) {
        const n = normalize(fld);
        if (n && (n.includes(target) || target.includes(n))) return r;
      }
    }
  }
  return null;
}

// 1. apt_master 유니크 (lawd_cd, dong) 그룹화
console.log('[1] apt_master 그룹화...');
const aptRows = [];
for (let off = 0; off < 30000; off += 1000) {
  const { data } = await sb.from('apt_master')
    .select('id, apt_nm, dong, lawd_cd')
    .not('lat', 'is', null)
    .is('household_count', null)
    .range(off, off + 999);
  if (!data || data.length === 0) break;
  aptRows.push(...data);
  if (data.length < 1000) break;
}
console.log(`처리 대상 (좌표 보유 + household 미수집): ${aptRows.length}`);

const groups = new Map(); // key = `${lawd}|${dong}` → rows[]
for (const r of aptRows) {
  if (!r.dong) continue;
  const key = `${r.lawd_cd}|${r.dong}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
console.log(`(lawd, dong) 그룹: ${groups.size}개`);

const todoGroups = FULL ? [...groups.entries()] : [...groups.entries()].slice(0, 1);
console.log(`이번 실행: ${todoGroups.length}개 그룹\n`);

// 2. 그룹별 ODcloud 호출 + 매칭
let totalSuccess = 0, totalFailed = 0, totalCalled = 0;
const t0 = Date.now();
let groupIdx = 0;

for (const [key, rows] of todoGroups) {
  groupIdx++;
  const [lawd, dong] = key.split('|');
  const sggName = SGG_NAME[lawd];
  if (!sggName) {
    console.warn(`  unknown lawd ${lawd}, skip`);
    continue;
  }
  // ODcloud는 시·도 풀이름 — "서울특별시 서초구 반포동" 형태로 검색
  const sidoFull = sggName.replace(/^서울\s/, '서울특별시 ').replace(/^인천\s/, '인천광역시 ').replace(/^경기\s/, '경기도 ');
  // SGG_NAME이 "서울 강남구" 형태 — 시·도와 시군구 분리
  const parts = sggName.split(' ');
  let query;
  if (parts[0] === '서울') query = `서울특별시 ${parts.slice(1).join(' ')} ${dong}`;
  else if (parts[0] === '인천') query = `인천광역시 ${parts.slice(1).join(' ')} ${dong}`;
  else query = `경기도 ${parts.join(' ')} ${dong}`;

  try {
    const odRows = await fetchOdcloudByDong(query);
    totalCalled++;
    let groupSuccess = 0;
    for (const aptRow of rows) {
      const match = findMatch(odRows, aptRow.apt_nm);
      if (match) {
        const buildYear = match.USEAPR_DT ? Number(match.USEAPR_DT.slice(0, 4)) : null;
        const { error } = await sb.from('apt_master').update({
          kapt_code: match.COMPLEX_PK,
          household_count: match.UNIT_CNT,
          building_count: match.DONG_CNT,
          kapt_build_year: buildYear,
          kapt_fetched_at: new Date().toISOString(),
        }).eq('id', aptRow.id);
        if (error) totalFailed++;
        else { totalSuccess++; groupSuccess++; }
      } else {
        totalFailed++;
      }
    }
    if (groupIdx % 10 === 0 || groupIdx === todoGroups.length) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const eta = ((todoGroups.length - groupIdx) * (Number(elapsed) / groupIdx)).toFixed(0);
      console.log(`  [${groupIdx}/${todoGroups.length}] ${query} → ${odRows.length}개 단지 (매칭 ${groupSuccess}/${rows.length}). 누적 성공 ${totalSuccess} 실패 ${totalFailed}. ${elapsed}초 / ETA ${eta}초`);
    } else if (!FULL) {
      console.log(`  ${query}: ODcloud ${odRows.length}개 단지, 매칭 ${groupSuccess}/${rows.length}`);
      console.log(`  매칭 샘플:`);
      for (const aptRow of rows.slice(0, 5)) {
        const match = findMatch(odRows, aptRow.apt_nm);
        console.log(`    ${aptRow.apt_nm} → ${match ? `${match.COMPLEX_NM2 || match.COMPLEX_NM1} (${match.UNIT_CNT}세대)` : 'no match'}`);
      }
    }
  } catch (e) {
    console.warn(`  group ${query} 실패: ${e instanceof Error ? e.message : e}`);
  }
  await new Promise((r) => setTimeout(r, RATE_MS));
}

console.log(`\n=== 결과 ===`);
console.log(`그룹 호출: ${totalCalled}`);
console.log(`매칭 성공: ${totalSuccess}`);
console.log(`매칭 실패: ${totalFailed}`);
console.log(`매칭률: ${(totalSuccess / (totalSuccess + totalFailed) * 100).toFixed(1)}%`);
