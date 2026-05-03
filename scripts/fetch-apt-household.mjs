// K-apt 공동주택 기본정보 fetch — apt_master 단지에 세대수·동수·건축연도 매핑
//
// 2단계 호출:
//   1) AptListService3/getSigunguAptList3 — 시군구별 단지 목록 (kaptCode + kaptName)
//   2) AptBasisInfoServiceV3/getAphusBassInfoV3 — kaptCode로 기본정보 (세대수 등)
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
const DRY = !args.has('--full');
const RATE_MS = 150;

// XML 파싱 헬퍼 (간단 정규식)
function getXml(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}
function getAllItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) items.push(m[1]);
  return items;
}

async function fetchSigungu(sggCd) {
  const allKapts = [];
  let pageNo = 1;
  for (;;) {
    const url = `https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3?serviceKey=${KEY}&sigunguCode=${sggCd}&pageNo=${pageNo}&numOfRows=999`;
    const res = await fetch(url);
    const xml = await res.text();
    if (!res.ok) throw new Error(`sgg ${sggCd} HTTP ${res.status}: ${xml.slice(0, 100)}`);
    const code = getXml(xml, 'resultCode');
    if (code !== '00' && code !== '000') throw new Error(`sgg ${sggCd} resultCode=${code}: ${getXml(xml, 'resultMsg')}`);
    const total = Number(getXml(xml, 'totalCount') ?? '0');
    for (const item of getAllItems(xml)) {
      const kaptCode = getXml(item, 'kaptCode');
      const kaptName = getXml(item, 'kaptName');
      const as1 = getXml(item, 'as1') ?? ''; // sido
      const as2 = getXml(item, 'as2') ?? ''; // sigungu
      const as3 = getXml(item, 'as3') ?? ''; // dong
      if (kaptCode && kaptName) allKapts.push({ kaptCode, kaptName, as3 });
    }
    if (pageNo * 999 >= total) break;
    pageNo++;
    await new Promise((r) => setTimeout(r, RATE_MS));
  }
  return allKapts;
}

async function fetchBasisInfo(kaptCode) {
  const url = `https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusBassInfoV3?serviceKey=${KEY}&kaptCode=${kaptCode}`;
  const res = await fetch(url);
  const xml = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const code = getXml(xml, 'resultCode');
  if (code !== '00' && code !== '000') throw new Error(`resultCode=${code}: ${getXml(xml, 'resultMsg')}`);
  return {
    kaptdaCnt: Number(getXml(xml, 'kaptdaCnt') ?? '0'),       // 세대수
    kaptdongCnt: Number(getXml(xml, 'kaptdongCnt') ?? '0'),   // 동수
    kaptUsedate: getXml(xml, 'kaptUsedate'),                  // 사용승인일 YYYYMMDD
  };
}

// 1) apt_master에서 unique sgg_cd 수집
const { data: amData } = await sb.from('apt_master')
  .select('lawd_cd, apt_nm, dong')
  .not('lat', 'is', null);
const aptMaster = (amData ?? []);
const sggSet = new Set(aptMaster.map((r) => r.lawd_cd));
console.log(`apt_master 좌표 보유 단지: ${aptMaster.length}, 시군구: ${sggSet.size}개`);

if (DRY) {
  console.log('DRY 모드 — 강남구(11680)만 1단계 호출 테스트');
  const list = await fetchSigungu('11680');
  console.log(`강남구 K-apt 단지: ${list.length}개. 샘플:`);
  for (const k of list.slice(0, 5)) console.log(`  ${k.kaptCode} | ${k.kaptName} | ${k.as3}`);
  if (list[0]) {
    console.log('\n첫 단지 기본정보:');
    const info = await fetchBasisInfo(list[0].kaptCode);
    console.log(' ', list[0].kaptName, info);
  }
  console.log('\n--full 로 실행하면 전체 시군구 처리.');
  process.exit(0);
}

// 2) 시군구별 단지 목록 fetch (모든 sgg_cd 수도권)
console.log('\n[1] 시군구별 K-apt 단지 목록 fetch...');
const allKapts = []; // {kaptCode, kaptName, sggCd, as3}
let sggDone = 0;
for (const sgg of sggSet) {
  try {
    const list = await fetchSigungu(sgg);
    for (const k of list) allKapts.push({ ...k, sggCd: sgg });
    sggDone++;
    if (sggDone % 5 === 0) console.log(`  ${sggDone}/${sggSet.size} 시군구 처리, 누적 단지 ${allKapts.length}`);
  } catch (e) {
    console.warn(`  sgg ${sgg} 실패: ${e instanceof Error ? e.message : e}`);
  }
  await new Promise((r) => setTimeout(r, RATE_MS));
}
console.log(`총 K-apt 단지: ${allKapts.length}`);

// 3) apt_master.apt_nm × K-apt.kaptName 매칭
// 같은 sgg_cd 내에서 kaptName이 apt_nm과 동일 또는 핵심 토큰 포함
function normalize(s) { return s.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').trim(); }

const kaptBySgg = new Map();
for (const k of allKapts) {
  if (!kaptBySgg.has(k.sggCd)) kaptBySgg.set(k.sggCd, []);
  kaptBySgg.get(k.sggCd).push(k);
}

const matched = []; // {apt_nm, dong, lawd_cd, kaptCode, kaptName}
for (const am of aptMaster) {
  const candidates = kaptBySgg.get(am.lawd_cd) ?? [];
  const amNorm = normalize(am.apt_nm);
  // 1) 정확 일치
  let hit = candidates.find((k) => normalize(k.kaptName) === amNorm);
  // 2) 4자 이상 핵심 토큰 포함
  if (!hit && amNorm.length >= 4) {
    hit = candidates.find((k) => normalize(k.kaptName).includes(amNorm) || amNorm.includes(normalize(k.kaptName)));
  }
  if (hit) matched.push({ apt_nm: am.apt_nm, dong: am.dong, lawd_cd: am.lawd_cd, kaptCode: hit.kaptCode, kaptName: hit.kaptName });
}
console.log(`\n매칭: ${matched.length}/${aptMaster.length} (${(matched.length/aptMaster.length*100).toFixed(1)}%)`);

// 4) 각 매칭 단지의 기본정보 fetch + apt_master upsert
console.log('\n[2] 단지별 기본정보 fetch...');
let success = 0, failed = 0;
const t0 = Date.now();
for (let i = 0; i < matched.length; i++) {
  const m = matched[i];
  try {
    const info = await fetchBasisInfo(m.kaptCode);
    const buildYear = info.kaptUsedate ? Number(info.kaptUsedate.slice(0, 4)) : null;
    const { error } = await sb.from('apt_master').update({
      kapt_code: m.kaptCode,
      household_count: info.kaptdaCnt,
      building_count: info.kaptdongCnt,
      kapt_build_year: buildYear,
      kapt_fetched_at: new Date().toISOString(),
    }).eq('apt_nm', m.apt_nm).eq('dong', m.dong).eq('lawd_cd', m.lawd_cd);
    if (error) { failed++; console.warn(`upsert err ${m.apt_nm}: ${error.message}`); }
    else success++;
  } catch (e) {
    failed++;
    if (failed < 10) console.warn(`fetch err ${m.apt_nm}: ${e instanceof Error ? e.message : e}`);
  }
  if ((i + 1) % 100 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const eta = ((matched.length - i - 1) * (Number(elapsed) / (i + 1))).toFixed(0);
    console.log(`  [${i+1}/${matched.length}] 성공 ${success} 실패 ${failed} | ${elapsed}초 / ETA ${eta}초`);
  }
  await new Promise((r) => setTimeout(r, RATE_MS));
}
console.log(`\n완료: 성공 ${success}, 실패 ${failed}`);
