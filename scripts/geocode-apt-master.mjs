// 단지 마스터 지오코딩 — apt_trades에서 unique 단지 추출 후 카카오 키워드 검색으로 좌표 부여
//
// 사용법:
//   node scripts/geocode-apt-master.mjs              → dry run 50건 (매칭률 확인)
//   node scripts/geocode-apt-master.mjs --full       → 전체 unique 단지 처리
//   node scripts/geocode-apt-master.mjs --resume     → geocoded되지 않은 것만 (full 도중 끊겼을 때)
//
// 환경변수: KAKAO_REST_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of text.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
if (!KAKAO_KEY) { console.error('KAKAO_REST_API_KEY 누락'); process.exit(1); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const args = new Set(process.argv.slice(2));
const FULL = args.has('--full');
const RESUME = args.has('--resume');
const LIMIT = FULL || RESUME ? 999999 : 50;
const RATE_MS = 100; // 초당 10건

console.log(`모드: ${FULL ? 'FULL' : RESUME ? 'RESUME' : 'DRY RUN(50건)'}`);

// 1. apt_trades에서 unique (apt_nm, dong, lawd_cd) 수집
console.log('\n[1] apt_trades에서 unique 단지 추출...');
const seen = new Map(); // key → {apt_nm, dong, lawd_cd}
for (let off = 0; off < 300000; off += 1000) {
  const { data } = await sb.from('apt_trades').select('apt_nm, dong, lawd_cd').range(off, off + 999);
  if (!data || data.length === 0) break;
  for (const r of data) {
    if (!r.apt_nm || !r.lawd_cd) continue;
    const key = `${r.apt_nm}|${r.dong || ''}|${r.lawd_cd}`;
    if (!seen.has(key)) seen.set(key, { apt_nm: r.apt_nm, dong: r.dong || null, lawd_cd: r.lawd_cd });
  }
  if (data.length < 1000) break;
}
console.log(`  unique: ${seen.size}개`);

// 2. 이미 좌표가 있는 것만 제외 (실패 표시된 것은 개선된 쿼리로 재시도)
console.log('\n[2] apt_master에서 좌표 보유 단지 제외 (실패는 재시도 대상)...');
const processedKeys = new Set();
{
  for (let off = 0; off < 300000; off += 1000) {
    const { data } = await sb.from('apt_master').select('apt_nm, dong, lawd_cd, lat, lng').range(off, off + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.lat !== null) processedKeys.add(`${r.apt_nm}|${r.dong || ''}|${r.lawd_cd}`);
    }
    if (data.length < 1000) break;
  }
}
console.log(`  이미 좌표 있음 (skip): ${processedKeys.size}개`);

const todo = [...seen.entries()]
  .filter(([key]) => !processedKeys.has(key))
  .map(([, v]) => v)
  .slice(0, LIMIT);
console.log(`  처리 대상: ${todo.length}개`);

if (todo.length === 0) { console.log('처리할 단지 없음. 종료.'); process.exit(0); }

// 단지명 정제 — 카카오 매칭률 향상용 변형들
function cleanedNames(rawName) {
  const variants = new Set();
  const orig = rawName.trim();
  variants.add(orig);

  // 1) 괄호 안 제거 — "대치동우정에쉐르2(890-42)" → "대치동우정에쉐르2"
  const noParen = orig.replace(/\([^)]*\)/g, '').trim();
  if (noParen) variants.add(noParen);

  // 2) 콤마 이전만 — "청학아파트에이동,비동,씨동" → "청학아파트에이동"
  const noComma = noParen.split(/[,，]/)[0].trim();
  if (noComma) variants.add(noComma);

  // 3) 트레일링 숫자 분리 — "타워팰리스1" → "타워팰리스 1차" + "타워팰리스"
  const trailingDigit = noComma.match(/^(.+?)(\d+)$/);
  if (trailingDigit && /[가-힣]/.test(trailingDigit[1])) {
    variants.add(`${trailingDigit[1].trim()} ${trailingDigit[2]}차`);
    variants.add(`${trailingDigit[1].trim()}${trailingDigit[2]}차`);
    variants.add(trailingDigit[1].trim());
  }

  // 4) 동·호수 패턴 제거 — "청학아파트에이동" → "청학아파트"
  const noDongSuffix = noComma.replace(/[가-힣]동$/, '').replace(/(에이|비|씨|디|이|에프|지|에이치|아이)동.*$/, '').trim();
  if (noDongSuffix && noDongSuffix.length >= 3) variants.add(noDongSuffix);

  return [...variants];
}

async function kakaoSearch(query) {
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${body.slice(0, 100)}`);
  }
  const json = await res.json();
  return json.documents ?? [];
}

// 3. 카카오 키워드 검색 호출 + upsert
console.log('\n[3] 카카오 키워드 검색 시작...');
let success = 0, failed = 0;
const failures = [];
const t0 = Date.now();

for (let i = 0; i < todo.length; i++) {
  const apt = todo[i];
  const nameVariants = cleanedNames(apt.apt_nm);
  const dongPrefix = apt.dong ? `${apt.dong} ` : '';

  try {
    let best = null;
    // 변형들을 순서대로 시도 — 카테고리 적합 결과 찾을 때까지 계속
    // 첫 결과만 보지 말고 docs 전체에서 "아파트/주거시설" 카테고리 찾기 (주차장·음식점 오매칭 방지)
    for (const nm of nameVariants) {
      const query = `${dongPrefix}${nm}`;
      const docs = await kakaoSearch(query);
      if (docs.length === 0) continue;
      const core = nm.replace(/\([^)]*\)/g, '').trim();
      const corePrefix = core.slice(0, Math.min(4, core.length));
      // 결과 필터: 카테고리·이름에 "오피스텔" / "오피스" 포함은 제외 (사용자 요구)
      const filtered = docs.filter((d) => {
        const cat = d.category_name || '';
        const name = d.place_name || '';
        if (cat.includes('오피스텔') || name.includes('오피스텔')) return false;
        if (cat.includes('주차장') || cat.includes('정문')) return false;
        return true;
      });
      // 1) 카테고리에 "아파트" 또는 "주거시설" 포함 + 단지명 핵심토큰 포함
      const aptMatch = filtered.find((d) =>
        d.place_name && d.place_name.includes(corePrefix)
        && d.category_name && (d.category_name.includes('아파트') || d.category_name.includes('주거시설'))
      );
      if (aptMatch) { best = aptMatch; break; }
      // 2) 카테고리만 아파트면 OK (단지명 약간 달라도 같은 단지 가능성)
      const aptOnly = filtered.find((d) => d.category_name && (d.category_name.includes('아파트') || d.category_name.includes('주거시설')));
      if (aptOnly) { best = aptOnly; break; }
      // 변형 더 시도 — 이번 변형엔 아파트 카테고리 없음
      await new Promise((r) => setTimeout(r, RATE_MS));
    }
    // 모든 변형에서 아파트 카테고리 못 찾으면 fail로 마킹.
    // (이전 폴백: 첫 결과 docs[0] → 광장아파트가 "녹음수광장"으로, 대교아파트가 "마포대교"로
    //  잘못 매칭되는 사고. 카테고리 안 맞으면 차라리 매칭 안 시키는 게 안전)

    if (!best) {
      failures.push({ apt, reason: 'no_results' });
      await sb.from('apt_master').upsert({
        apt_nm: apt.apt_nm, dong: apt.dong, lawd_cd: apt.lawd_cd,
        geocode_failed: true, geocode_failure_reason: `no_results (tried ${nameVariants.length} variants)`, geocoded_at: new Date().toISOString(),
      }, { onConflict: 'apt_nm,dong,lawd_cd' });
      failed++;
    } else {
      const lat = Number(best.y);
      const lng = Number(best.x);
      const { error } = await sb.from('apt_master').upsert({
        apt_nm: apt.apt_nm, dong: apt.dong, lawd_cd: apt.lawd_cd,
        lat, lng,
        geocoded_address: best.address_name ?? best.road_address_name ?? null,
        geocoded_place_name: best.place_name ?? null,
        geocoded_category: best.category_name ?? null,
        geocoded_at: new Date().toISOString(),
        geocode_failed: false,
      }, { onConflict: 'apt_nm,dong,lawd_cd' });
      if (error) { failures.push({ apt, reason: `upsert: ${error.message}` }); failed++; }
      else success++;
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    failures.push({ apt, reason });
    failed++;
  }

  // progress
  if ((i + 1) % 50 === 0 || i === todo.length - 1) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const rate = ((i + 1) / Number(elapsed || 1)).toFixed(1);
    const eta = ((todo.length - i - 1) / Number(rate || 1)).toFixed(0);
    console.log(`  [${i + 1}/${todo.length}] 성공 ${success}, 실패 ${failed} | ${elapsed}초 경과, ETA ${eta}초`);
  }
  await new Promise((r) => setTimeout(r, RATE_MS));
}

console.log(`\n=== 결과 ===`);
console.log(`성공: ${success} (${((success / todo.length) * 100).toFixed(1)}%)`);
console.log(`실패: ${failed}`);
if (failures.length > 0) {
  console.log(`\n실패 샘플 (최대 20개):`);
  for (const f of failures.slice(0, 20)) {
    console.log(`  ${f.apt.apt_nm} (${f.apt.dong || '-'}, ${f.apt.lawd_cd}) — ${f.reason}`);
  }
}
