// 국토부 아파트매매 실거래가 → Supabase apt_trades 적재
// 사용:
//   node scripts/molit-ingest.mjs <LAWD_CD> <YYYYMM>                    (단발)
//   node scripts/molit-ingest.mjs <LAWD_CD> <YYYYMM_FROM> <YYYYMM_TO>   (범위)
// 예:
//   node scripts/molit-ingest.mjs 11680 202604           (강남구 2026-04)
//   node scripts/molit-ingest.mjs 11680 202504 202604    (강남구 1년치)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ─── 환경변수 로드 ──────────────────────────
function loadEnv() {
  const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const apiKey = process.env.MOLIT_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!apiKey) { console.error('MOLIT_API_KEY 누락'); process.exit(1); }
if (!supabaseUrl || !supabaseKey) { console.error('SUPABASE 환경변수 누락'); process.exit(1); }

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── 인자 파싱 ──────────────────────────
const lawdCd = process.argv[2];
const ymdFrom = process.argv[3];
const ymdTo = process.argv[4] || ymdFrom;

if (!lawdCd || !ymdFrom) {
  console.error('사용법: node scripts/molit-ingest.mjs <LAWD_CD> <YYYYMM> [<YYYYMM_TO>]');
  process.exit(1);
}

function* yyyymmRange(from, to) {
  let y = Math.floor(from / 100), m = from % 100;
  const yEnd = Math.floor(to / 100), mEnd = to % 100;
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    yield y * 100 + m;
    m++;
    if (m > 12) { m = 1; y++; }
  }
}

// ─── XML 느슨한 파서 (단발 호출용) ──────────────
function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const body = m[1];
    const get = (tag) => {
      const r = body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return r ? r[1].trim() : null;
    };
    const dealAmountRaw = get('dealAmount');
    const dealAmount = dealAmountRaw ? Number(dealAmountRaw.replace(/[\s,]/g, '')) : null;
    const dealYear = get('dealYear');
    const dealMonth = get('dealMonth');
    const dealDay = get('dealDay');
    const dealDate = dealYear && dealMonth && dealDay
      ? `${dealYear}-${String(dealMonth).padStart(2, '0')}-${String(dealDay).padStart(2, '0')}`
      : null;
    const cdealDay = get('cdealDay');
    const rgstDate = get('rgstDate');
    return {
      apt_seq: get('aptSeq'),
      apt_nm: get('aptNm'),
      apt_dong: get('aptDong'),
      sgg_cd: get('sggCd'),
      umd_cd: get('umdCd'),
      umd_nm: get('umdNm'),
      jibun: get('jibun'),
      road_nm: get('roadNm'),
      excl_use_ar: Number(get('excluUseAr')),
      floor: get('floor') ? Number(get('floor')) : null,
      build_year: get('buildYear') ? Number(get('buildYear')) : null,
      deal_date: dealDate,
      deal_amount: dealAmount,
      dealing_gbn: get('dealingGbn'),
      cdeal_type: get('cdealType'),
      cdeal_day: cdealDay && /^\d{8}$/.test(cdealDay)
        ? `${cdealDay.slice(0, 4)}-${cdealDay.slice(4, 6)}-${cdealDay.slice(6, 8)}`
        : null,
      rgst_date: rgstDate && /^\d{8}$/.test(rgstDate)
        ? `${rgstDate.slice(0, 4)}-${rgstDate.slice(4, 6)}-${rgstDate.slice(6, 8)}`
        : null,
      sler_gbn: get('slerGbn'),
      buyer_gbn: get('buyerGbn'),
    };
  }).filter((r) => r.apt_nm && r.deal_date && r.deal_amount && r.excl_use_ar);
}

// ─── API 호출 (페이지네이션) ─────────────────
async function fetchMonth(lawdCd, dealYmd) {
  const endpoint = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
  const all = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      LAWD_CD: lawdCd,
      DEAL_YMD: String(dealYmd),
      pageNo: String(page),
      numOfRows: String(perPage),
    });
    const url = `${endpoint}?${params.toString()}`;
    const res = await fetch(url);
    const xml = await res.text();
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${xml.slice(0, 200)}`);
    }
    const resultCode = xml.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1];
    if (resultCode !== '000') {
      const msg = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1];
      throw new Error(`API resultCode=${resultCode} (${msg}). 본문: ${xml.slice(0, 300)}`);
    }
    const totalCount = Number(xml.match(/<totalCount>([^<]+)<\/totalCount>/)?.[1] ?? '0');
    const items = parseItems(xml);
    all.push(...items);
    if (page * perPage >= totalCount) break;
    page++;
  }
  return all;
}

// ─── DB upsert ─────────────────────────
async function upsertTrades(rows) {
  if (rows.length === 0) return { inserted: 0, errors: 0 };
  // 자연키로 충돌 → 무시 (이미 적재된 거래 skip)
  const { error, count } = await supabase
    .from('apt_trades')
    .upsert(rows, { onConflict: 'apt_nm,jibun,excl_use_ar,floor,deal_date,deal_amount,apt_dong', ignoreDuplicates: true, count: 'exact' });
  if (error) {
    console.error('upsert 오류:', error.message);
    return { inserted: 0, errors: rows.length };
  }
  return { inserted: count ?? 0, errors: 0 };
}

// ─── 메인 ──────────────────────────
console.log(`\n[적재 시작] LAWD_CD=${lawdCd}, ${ymdFrom} ~ ${ymdTo}\n`);

let totalFetched = 0;
let totalInserted = 0;
const months = [...yyyymmRange(Number(ymdFrom), Number(ymdTo))];

for (const ymd of months) {
  process.stdout.write(`  ${ymd}: 호출 중...`);
  try {
    const rows = await fetchMonth(lawdCd, ymd);
    const { inserted } = await upsertTrades(rows);
    totalFetched += rows.length;
    totalInserted += inserted;
    console.log(` ${rows.length}건 fetch / ${inserted}건 신규 적재`);
  } catch (e) {
    console.log(` 실패: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 200)); // API 호출 간격
}

console.log(`\n[완료] 총 ${months.length}개월, ${totalFetched}건 fetch, ${totalInserted}건 신규 적재\n`);
